import { Hono } from 'hono'
import nodemailer from 'nodemailer'
import { appendTransaction } from './logs'

const mail = new Hono()

interface SMTPProfile {
  type: 'smtp'
  host: string
  port: number
  security: 'none' | 'starttls' | 'tls'
  username?: string
  password?: string
}

interface HTTPProfile {
  type: 'http'
  url: string
  authHeader?: string
}

interface SendPayload {
  profile: SMTPProfile | HTTPProfile
  from: string
  replyTo?: string
  to: string
  subject: string
  body: string
}

function formatArgs(args: any[]): string {
  return args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')
}

mail.post('/send', async (c) => {
  let payload: SendPayload

  try {
    payload = await c.req.json<SendPayload>()
  } catch {
    return c.json({ error: 'Invalid JSON payload' }, 400)
  }

  const { profile, from, replyTo, to, subject, body } = payload

  if (!profile || !from || !to || !subject || !body) {
    return c.json({ error: 'Missing required fields: profile, from, to, subject, body' }, 400)
  }

  const transactionId = crypto.randomUUID()
  const timestamp = new Date().toISOString()

  try {
    if (profile.type === 'smtp') {
      const { host, port, security, username, password } = profile

      const secure = security === 'tls'
      const requireTLS = security === 'starttls'

      const transcript: string[] = []

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS,
        auth: username ? { user: username, pass: password } : undefined,
        tls: { rejectUnauthorized: false },
        debug: true,
        logger: {
          level: () => {},
          trace: (...args: any[]) => { const line = `TRACE ${formatArgs(args.slice(1))}`; transcript.push(line); console.log(line) },
          debug: (...args: any[]) => { const line = `DEBUG ${formatArgs(args.slice(1))}`; transcript.push(line); console.log(line) },
          info:  (...args: any[]) => { const line = `INFO  ${formatArgs(args.slice(1))}`; transcript.push(line); console.log(line) },
          warn:  (...args: any[]) => { const line = `WARN  ${formatArgs(args.slice(1))}`; transcript.push(line); console.warn(line) },
          error: (...args: any[]) => { const line = `ERROR ${formatArgs(args.slice(1))}`; transcript.push(line); console.error(line) },
          fatal: (...args: any[]) => { const line = `FATAL ${formatArgs(args.slice(1))}`; transcript.push(line); console.error(line) },
        },
      })

      const info = await transporter.sendMail({
        from,
        replyTo: replyTo || undefined,
        to,
        subject,
        text: body,
      })

      await appendTransaction({
        id: transactionId,
        timestamp,
        profile: { type: 'smtp', host, port, security, username },
        from,
        replyTo,
        to,
        subject,
        result: 'success',
        messageId: info.messageId,
        response: info.response,
        transcript,
      })

      return c.json({
        success: true,
        messageId: info.messageId,
        response: info.response,
        transcript,
      })
    } else if (profile.type === 'http') {
      const { url, authHeader } = profile

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (authHeader) headers['Authorization'] = authHeader

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from, replyTo, to, subject, body }),
      })

      const text = await res.text()

      await appendTransaction({
        id: transactionId,
        timestamp,
        profile: { type: 'http', url },
        from,
        replyTo,
        to,
        subject,
        result: res.ok ? 'success' : 'error',
        response: text,
        transcript: [],
      })

      if (!res.ok) {
        return c.json({ error: `Relay endpoint responded with ${res.status}: ${text}` }, 502)
      }

      return c.json({ success: true, response: text })
    } else {
      return c.json({ error: 'Unknown profile type' }, 400)
    }
  } catch (err: any) {
    console.error('Send error:', err)

    await appendTransaction({
      id: transactionId,
      timestamp,
      profile,
      from,
      replyTo,
      to,
      subject,
      result: 'error',
      error: err.message,
      transcript: [],
    })

    return c.json({ error: err.message || 'Failed to send message' }, 500)
  }
})

export default mail