#!/usr/bin/env node
// One-time swarm provisioning: a funded broker keypair + two seller receive wallets.
// Writes BROKER_KEYPAIR_B58, BROKER_WALLET, SELLER_CHEAP_WALLET, SELLER_PREMIUM_WALLET to .env,
// and tops the broker up by transferring devnet SOL from the existing buyer wallet (the faucet is
// manual, so we bootstrap from an already-funded wallet). Safe to re-run — reuses existing values.

import { Keypair, Connection, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from '@solana/web3.js'
import bs58 from 'bs58'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envPath = join(root, '.env')
let env = readFileSync(envPath, 'utf8')

const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, 'm'))?.[1]
const set = (k, v) =>
  (env = new RegExp(`^${k}=`, 'm').test(env)
    ? env.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`)
    : `${env.trimEnd()}\n${k}=${v}\n`)

const RPC = get('SOLANA_RPC_URL') || 'https://api.devnet.solana.com'
const conn = new Connection(RPC, 'confirmed')

// Broker keypair (reuse if present).
let broker
if (get('BROKER_KEYPAIR_B58')) {
  broker = Keypair.fromSecretKey(bs58.decode(get('BROKER_KEYPAIR_B58')))
  console.log(`reusing broker ${broker.publicKey.toBase58()}`)
} else {
  broker = Keypair.generate()
  set('BROKER_KEYPAIR_B58', bs58.encode(broker.secretKey))
  console.log(`generated broker ${broker.publicKey.toBase58()}`)
}
set('BROKER_WALLET', broker.publicKey.toBase58())

// Two seller receive wallets (pubkeys only — they just receive).
if (!get('SELLER_CHEAP_WALLET')) set('SELLER_CHEAP_WALLET', Keypair.generate().publicKey.toBase58())
if (!get('SELLER_PREMIUM_WALLET')) set('SELLER_PREMIUM_WALLET', Keypair.generate().publicKey.toBase58())

writeFileSync(envPath, env)
console.log(`seller-cheap   → ${get('SELLER_CHEAP_WALLET')}`)
console.log(`seller-premium → ${get('SELLER_PREMIUM_WALLET')}`)

// Fund accounts from the buyer wallet. The broker pays sellers, so it needs SOL; the two seller
// wallets must be rent-exempt (>~0.00089 SOL) or a 0.0001 payment to an empty account is rejected.
const buyer = Keypair.fromSecretKey(bs58.decode(get('BUYER_KEYPAIR_B58')))
async function topUp(label, pubkey, target, min) {
  const { PublicKey } = await import('@solana/web3.js')
  const pk = new PublicKey(pubkey)
  const bal = (await conn.getBalance(pk)) / LAMPORTS_PER_SOL
  if (bal >= min) { console.log(`${label}: ${bal} SOL (ok)`); return }
  console.log(`${label}: ${bal} SOL → funding ${target} SOL from buyer…`)
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: buyer.publicKey, toPubkey: pk, lamports: Math.round(target * LAMPORTS_PER_SOL) }),
  )
  const sig = await sendAndConfirmTransaction(conn, tx, [buyer])
  console.log(`  funded ${label}: ${sig}`)
}

await topUp('broker        ', broker.publicKey.toBase58(), 0.1, 0.02)
await topUp('seller-cheap  ', get('SELLER_CHEAP_WALLET'), 0.005, 0.001)   // rent-exempt so payments land
await topUp('seller-premium', get('SELLER_PREMIUM_WALLET'), 0.005, 0.001)
console.log('done — .env updated, accounts funded.')
