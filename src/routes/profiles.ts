import { Hono } from 'hono'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { ensureLogsDir, LOGS_DIR } from './logs'
import path from 'path'

const profiles = new Hono()

const PROFILES_FILE = path.join(LOGS_DIR, 'profiles.json')

async function readProfiles(): Promise<any[]> {
  await ensureLogsDir()
  if (!existsSync(PROFILES_FILE)) return []
  const raw = await readFile(PROFILES_FILE, 'utf-8')
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

async function writeProfiles(profiles: any[]): Promise<void> {
  await ensureLogsDir()
  await writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2))
}

profiles.get('/', async (c) => {
  const data = await readProfiles()
  return c.json({ profiles: data })
})

profiles.post('/', async (c) => {
  const body = await c.req.json()
  const data = await readProfiles()
  const profile = { ...body, id: body.id || crypto.randomUUID() }
  data.push(profile)
  await writeProfiles(data)
  return c.json({ profile })
})

profiles.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const data = await readProfiles()
  const idx = data.findIndex((p: any) => p.id === id)
  if (idx === -1) return c.json({ error: 'Profile not found' }, 404)
  data[idx] = { ...body, id }
  await writeProfiles(data)
  return c.json({ profile: data[idx] })
})

profiles.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const data = await readProfiles()
  const filtered = data.filter((p: any) => p.id !== id)
  await writeProfiles(filtered)
  return c.json({ success: true })
})

export default profiles