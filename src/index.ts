import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import mailRouter from './routes/mail'
import logsRouter from './routes/logs'
import profilesRouter from './routes/profiles'

const app = new Hono()

app.use('*', logger())
app.use('*', cors())

app.use('/api/*', async (c, next) => {
  const apiKey = Bun.env.API_KEY
  if (!apiKey) {
    return c.json({ error: 'Server misconfigured: API_KEY not set' }, 500)
  }
  const provided = c.req.header('x-api-key')
  if (provided !== apiKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  await next()
})

app.route('/api', mailRouter)
app.route('/api/logs', logsRouter)
app.route('/api/profiles', profilesRouter)

app.use('/*', serveStatic({ root: './src/public' }))
app.get('/', serveStatic({ path: './src/public/index.html' }))

const port = Number(Bun.env.PORT) || 3000
console.log(`⚡ Port587 running on http://localhost:${port}`)

export default { port, fetch: app.fetch }