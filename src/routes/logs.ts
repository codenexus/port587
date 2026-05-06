import { Hono } from 'hono'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

const logs = new Hono()

export const LOGS_DIR = path.join(process.cwd(), 'logs')
export const LOGS_FILE = path.join(LOGS_DIR, 'transactions.jsonl')

export async function ensureLogsDir() {
  if (!existsSync(LOGS_DIR)) {
    await mkdir(LOGS_DIR, { recursive: true })
  }
}

export async function appendTransaction(entry: object) {
  await ensureLogsDir()
  const line = JSON.stringify(entry) + '\n'
  await writeFile(LOGS_FILE, line, { flag: 'a' })
}

export async function readTransactions() {
  await ensureLogsDir()
  if (!existsSync(LOGS_FILE)) return []
  const raw = await readFile(LOGS_FILE, 'utf-8')
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .reverse()
}

logs.get('/', async (c) => {
  const transactions = await readTransactions()
  return c.json({ transactions })
})

logs.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const transactions = await readTransactions()
  const filtered = transactions.reverse().filter((t: any) => t.id !== id)
  await ensureLogsDir()
  await writeFile(LOGS_FILE, filtered.map((t: any) => JSON.stringify(t)).join('\n') + '\n')
  return c.json({ success: true })
})

export default logs