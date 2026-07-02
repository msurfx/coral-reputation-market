import express from 'express'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { foldRounds } from './foldRounds.js'
import { collectMessages } from './coralState.js'

const MARKET_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

const BASE = process.env.CORAL_SERVER_URL ?? 'http://localhost:5555'
const TOKEN = process.env.CORAL_TOKEN ?? 'dev'
const NS = 'default'
const PORT = Number(process.env.PORT ?? 4000)
const DEFAULT_SESSION = process.env.SESSION ?? ''
const FIXTURE = process.env.FEED_FIXTURE
const SELLERS = (process.env.MARKET_SELLERS ?? 'seller-cheap,seller-premium,seller-lazy')
  .split(',').map((s) => s.trim()).filter(Boolean)

async function readState(session: string): Promise<unknown> {
  if (FIXTURE) return JSON.parse(readFileSync(FIXTURE, 'utf8'))
  const r = await fetch(`${BASE}/api/v1/local/session/${NS}/${session}/extended`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!r.ok) throw new Error(`coral ${r.status}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

const app = express()
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  next()
})

app.use(express.json())

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.post('/api/start', (req, res) => {
  const failRounds = typeof req.body?.failRounds === 'string' ? req.body.failRounds : ''
  const env = failRounds ? { ...process.env, CHEAP_FAIL_ROUNDS: failRounds } : process.env
  const child = spawn('npm', ['start'], { cwd: MARKET_DIR, shell: true, env })
  let buf = ''
  let done = false
  const reply = (code: number, body: unknown) => { if (!done) { done = true; res.status(code).json(body) } }
  const onData = (d: Buffer) => {
    buf += d.toString()
    const m = buf.match(/Market session ([a-f0-9-]+)/)
    if (m) reply(200, { session: m[1], failRounds: failRounds || undefined })
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('exit', (c) => reply(500, { error: `launcher exited ${c} without a session`, log: buf.slice(-400) }))
  setTimeout(() => reply(504, { error: 'launcher timed out', log: buf.slice(-400) }), 30_000)
})

app.get('/api/feed', async (req, res) => {
  const session = FIXTURE ? 'fixture' : ((req.query.session as string) || DEFAULT_SESSION)
  if (!FIXTURE && !session) return res.status(400).json({ error: 'no session — pass ?session=<id> or set SESSION' })
  try {
    const rounds = foldRounds(collectMessages(await readState(session)), SELLERS)
    res.json({ session, rounds, updatedAt: new Date().toISOString() })
  } catch (e) {
    res.status(502).json({ error: `feed failed: ${(e as Error).message}` })
  }
})

app.listen(PORT, () => console.error(`[feed] http://localhost:${PORT}/api/feed  (${FIXTURE ? `fixture=${FIXTURE}` : `coral=${BASE}`})`))
