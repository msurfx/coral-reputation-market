#!/usr/bin/env node
// `node scripts/doctor.js`  (or `just doctor`)
//
// One command that answers "am I ready to build?" — checks Node, Docker, your wallets,
// and coral/bridge, then (if the stack is up) runs ONE real payment end-to-end.
// All green = start building. Each failure prints the exact fix.

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { readFileSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')

const tty = process.stdout.isTTY
const c = (n, s) => (tty ? `\x1b[${n}m${s}\x1b[0m` : s)
let fails = 0, warns = 0
const ok   = (m)       => console.log(`  ${c('32', 'OK  ')} ${m}`)
const bad  = (m, fix)  => { fails++; console.log(`  ${c('31', 'FAIL')} ${m}`); if (fix) console.log(`       ${c('90', '→ ' + fix)}`) }
const warn = (m, fix)  => { warns++; console.log(`  ${c('33', 'WARN')} ${m}`); if (fix) console.log(`       ${c('90', '→ ' + fix)}`) }
const has  = (cmd)     => { try { execSync(cmd, { stdio: 'ignore' }); return true } catch { return false } }
const sleep = (ms)     => new Promise(r => setTimeout(r, ms))
const reachable = async (url) => { try { await fetch(url, { signal: AbortSignal.timeout(2000) }); return true } catch (e) { return e.name !== 'TypeError' && !String(e).includes('ECONNREFUSED') && !String(e.cause).includes('ECONNREFUSED') } }

console.log(c('1', '\nsol_coralOS — readiness check\n'))

// ── 1. Toolchain ────────────────────────────────────────────────────────────
console.log(c('1', 'Toolchain'))
const nodeMajor = parseInt(process.versions.node.split('.')[0], 10)
nodeMajor >= 20 ? ok(`Node ${process.version}`) : bad(`Node ${process.version} is too old`, 'install Node 20+ from nodejs.org')

if (has('docker info')) ok('Docker is installed and running')
else if (has('docker --version')) bad('Docker is installed but not running', 'start Docker Desktop, then re-run')
else bad('Docker not found', 'install Docker Desktop — or use examples/agent-economy/quickstart (no Docker)')

has('just --version') ? ok('just is installed') : warn('just not installed (optional)', 'winget install Casey.Just — or run the manual steps in the README')

// ── 2. Wallets ────────────────────────────────────────────────────────────────
console.log(c('1', '\nWallets'))
let rpc = 'https://api.devnet.solana.com', seller, buyer
if (!existsSync(envPath)) {
  bad('.env not found — no wallets yet', 'run: node scripts/setup.js')
} else {
  const env = readFileSync(envPath, 'utf8')
  rpc = env.match(/^SOLANA_RPC_URL=(\S+)/m)?.[1] || rpc
  seller = env.match(/^WALLET=(\S+)/m)?.[1]
  const b58 = env.match(/^BUYER_KEYPAIR_B58=(\S+)/m)?.[1]
  try { if (b58) { const { default: bs58 } = await import('bs58'); buyer = new PublicKey(bs58.decode(b58).slice(32)).toBase58() } } catch {}

  if (!seller || !buyer) bad('.env is missing WALLET / BUYER_KEYPAIR_B58', 'delete .env and re-run: node scripts/setup.js')
  else {
    const conn = new Connection(rpc, 'confirmed')
    for (const [name, addr] of [['Seller', seller], ['Buyer ', buyer]]) {
      try {
        const sol = await conn.getBalance(new PublicKey(addr)) / LAMPORTS_PER_SOL
        sol > 0 ? ok(`${name} wallet funded — ${sol} SOL`)
                : bad(`${name} wallet has 0 SOL  (${addr})`, 'fund it at https://faucet.solana.com (GitHub sign-in) — addresses are in WALLETS.txt')
      } catch {
        bad(`Could not reach RPC ${rpc}`, 'check your connection, or set SOLANA_RPC_URL in .env')
      }
    }
  }
}

// ── 3. Stack ──────────────────────────────────────────────────────────────────
console.log(c('1', '\nStack'))
const coralUp  = await reachable('http://localhost:5555')
const bridgeUp = await reachable('http://localhost:3010')
coralUp  ? ok('coral-server reachable on :5555')  : warn('coral-server not reachable on :5555', 'start it: docker compose up -d coral bridge')
bridgeUp ? ok('bridge reachable on :3010')        : warn('bridge not reachable on :3010',        'start it: docker compose up -d coral bridge')

// ── 4. End-to-end payment (only if the stack + wallets are ready) ─────────────
console.log(c('1', '\nEnd-to-end payment'))
const walletsReady = fails === 0 || (seller && buyer)
if (!bridgeUp) {
  warn('skipped — bridge is not up', 'bring the stack up, then re-run `just doctor`')
} else if (!walletsReady) {
  warn('skipped — fund the wallets first')
} else {
  try {
    process.stdout.write('  .... starting an autonomous buyer↔seller payment')
    await fetch('http://localhost:3010/autonomous/start', { method: 'POST' })
    let settled = false
    for (let i = 0; i < 30 && !settled; i++) {       // ~60s budget
      await sleep(2000); process.stdout.write('.')
      const feed = await fetch('http://localhost:3010/autonomous/feed').then(r => r.json()).catch(() => ({}))
      settled = (feed.messages || []).some(m => /DELIVERED/i.test(m.text))
    }
    process.stdout.write('\n')
    settled ? ok('a real on-chain payment settled and the seller delivered')
            : warn('no DELIVERED seen within 60s', 'check: docker compose logs -f coral  (agents can take ~20s on first run)')
  } catch (e) {
    warn(`payment check errored: ${e.message}`, 'check the stack: docker compose logs -f coral')
  }
}

// ── Verdict ───────────────────────────────────────────────────────────────────
console.log()
if (fails === 0 && warns === 0) console.log(c('32', 'READY — everything is green. Go build.\n'))
else if (fails === 0)           console.log(c('33', `READY to build — ${warns} optional warning(s) above (the stack just isn't running yet).\n`))
else                            console.log(c('31', `${fails} blocker(s) above — fix them, then re-run \`just doctor\`.\n`))
process.exit(fails === 0 ? 0 : 1)
