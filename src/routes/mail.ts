import { Hono } from 'hono'
import nodemailer from 'nodemailer'

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

  try {
    if (profile.type === 'smtp') {
      const { host, port, security, username, password } = profile

      const secure = security === 'tls'
      const requireTLS = security === 'starttls'

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS,
        auth: username ? { user: username, pass: password } : undefined,
        tls: {
          // Allow self-signed certs in dev — tighten this for prod if needed
          rejectUnauthorized: false,
        },
      })

      const info = await transporter.sendMail({
        from,
        replyTo: replyTo || undefined,
        to,
        subject,
        text: body,
      })

      return c.json({
        success: true,
        messageId: info.messageId,
        response: info.response,
      })
    } else if (profile.type === 'http') {
      const { url, authHeader } = profile

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (authHeader) {
        headers['Authorization'] = authHeader
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ from, replyTo, to, subject, body }),
      })

      const text = await res.text()
      if (!res.ok) {
        return c.json({ error: `Relay endpoint responded with ${res.status}: ${text}` }, 502)
      }

      return c.json({ success: true, response: text })
    } else {
      return c.json({ error: 'Unknown profile type' }, 400)
    }
  } catch (err: any) {
    console.error('Send error:', err)
    return c.json({ error: err.message || 'Failed to send message' }, 500)
  }
})

export default mail
