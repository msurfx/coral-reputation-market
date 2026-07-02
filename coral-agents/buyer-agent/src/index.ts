/**
 * Buyer agent - the marketplace buyer. Broadcasts a WANT into a shared CoralOS thread, collects
 * competing bids, picks the winner by REPUTATION-WEIGHTED SCORING (price AND on-chain-proven track
 * record, not price alone), and settles through the escrow contract:
 *
 *   WANT -> (collect BIDs for a window) -> SCORE + AWARD winner -> wait ESCROW_REQUIRED ->
 *   deposit() into escrow -> DEPOSITED -> wait DELIVERED -> release() to the seller
 *
 * Scoring: score = priceScore * PRICE_WEIGHT + reputationScore * REPUTATION_WEIGHT, both 0-100.
 * Reputation is built in-memory from this session's own settled rounds (completed vs failed
 * deliveries) — an unproven seller starts at a neutral 50, so price alone decides early rounds.
 *
 * Env: BUYER_KEYPAIR_B58 (signs), BUYER_MAX_SOL (budget), BUYER_SERVICE/BUYER_ARG (the WANT),
 *      MARKET_SELLERS (csv of seller names), BID_WINDOW_MS, SOLANA_RPC_URL,
 *      PRICE_WEIGHT (default 0.6), REPUTATION_WEIGHT (default 0.4), TRACE=1.
 *
 * The deposit/release calls settle against the escrow program deployed to devnet; they need a funded
 * devnet wallet + live RPC, so they run in a live market session rather than in `npm test`/CI.
 */
import {
  startCoralAgent, loadKeypairB58,
  formatWant, parseBid, parseEscrowRequired, formatAward, formatDeposited,
  selectBids, verb, messageRound,
  type Bid, type EscrowTerms, type CoralAgentContext,
} from '@pay/agent-runtime'
import { PublicKey } from '@solana/web3.js'
import { makeProgram, deposit, release, escrowPda } from './escrow.js'
import {
  ARBITER_PROGRAM_ID, ensureArbiterConfig, ensureArbiterFunded, makeArbiter,
  openArbitrated, arbitrateRelease, arbitratedEscrowPda,
} from './arbiter.js'
import { payoutMatches } from './guard.js'

const RPC = process.env.SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'
const BUDGET = Number(process.env.BUYER_MAX_SOL ?? '0.001')
const SERVICE = process.env.BUYER_SERVICE ?? 'txline'
// Rotate through several args so each round trades a *different* thing (BUYER_ARGS=csv of fixture ids,
// else the single BUYER_ARG). This is what stops the market looking like the same round on a loop.
const ARGS = (process.env.BUYER_ARGS || process.env.BUYER_ARG || 'SOL-USDC').split(',').map((s) => s.trim()).filter(Boolean)
const ARG = ARGS[0]
const BID_WINDOW_MS = Number(process.env.BID_WINDOW_MS ?? '5000')
const CYCLE_MS = Number(process.env.CYCLE_INTERVAL_MS ?? '30000')
const SELLERS = (process.env.MARKET_SELLERS ?? 'seller-worldcup,seller-fast,seller-premium')
  .split(',').map((s) => s.trim()).filter(Boolean)
// F3: the payout wallet the buyer expects (personas share one in the demo). If set, the buyer refuses
// to deposit to an ESCROW_REQUIRED whose seller= pubkey differs - binding the award to the payout.
const EXPECTED_SELLER_WALLET = process.env.SELLER_WALLET ?? ''
const SETTLEMENT_MODE = (process.env.SETTLEMENT_MODE ?? 'arbiter').toLowerCase()
const trace = process.env.TRACE === '1'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const expl = (kind: 'tx' | 'address', id: string) => `https://explorer.solana.com/${kind}/${id}?cluster=devnet`

// -- reputation-weighted bid scoring ------------------------------------------------------------
// Named weights so the demo is easy to explain to judges: "we weigh reputation at 40%, price at 60%".
const PRICE_WEIGHT = Number(process.env.PRICE_WEIGHT ?? '0.6')
const REPUTATION_WEIGHT = Number(process.env.REPUTATION_WEIGHT ?? '0.4')

// Reputation ledger — built from this session's own settled rounds. No decay, no persistence across
// sessions (v1 scope): completed vs failed deliveries only. Real money-can't-fake-it signal because
// it's derived from actual on-chain settlement outcomes (RELEASED), not a self-reported claim.
const reputation = new Map<string, { completed: number; failed: number }>()
const bumpReputation = (seller: string, key: 'completed' | 'failed') => {
  const r = reputation.get(seller) ?? { completed: 0, failed: 0 }
  r[key]++
  reputation.set(seller, r)
}
/** 0-100 success rate. An unproven seller starts at a neutral 50 — no penalty or bonus on debut. */
const reputationScore = (seller: string): number => {
  const r = reputation.get(seller)
  if (!r || r.completed + r.failed === 0) return 50
  return Math.round((r.completed / (r.completed + r.failed)) * 100)
}

interface ScoredBid { by: string; price: number; priceScore: number; repPct: number; total: number }

/** Deterministic reputation-weighted selection: price AND on-chain-proven track record, not price alone. */
function scoreBids(pool: Bid[]): { scores: Record<string, ScoredBid>; winner: Bid } {
  const scores: Record<string, ScoredBid> = {}
  let winner = pool[0]
  let bestTotal = -Infinity
  for (const b of pool) {
    const priceScore = Math.max(0, Math.min(100, Math.round(((BUDGET - b.priceSol) / BUDGET) * 100)))
    const repPct = reputationScore(b.by)
    const total = Math.round(priceScore * PRICE_WEIGHT + repPct * REPUTATION_WEIGHT)
    scores[b.by] = { by: b.by, price: b.priceSol, priceScore, repPct, total }
    if (total > bestTotal) { bestTotal = total; winner = b }
  }
  return { scores, winner }
}

/** Wait (bounded) for a message matching `round` that `parse` accepts. */
async function waitFor<T>(
  ctx: CoralAgentContext,
  round: number,
  parse: (text: string) => (T & { round: number }) | null,
  maxMs: number,
): Promise<T | null> {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    const m = await ctx.waitForMention(Math.max(500, deadline - Date.now()))
    if (!m) continue
    const parsed = parse(m.text)
    if (parsed && parsed.round === round) return parsed
  }
  return null
}

await startCoralAgent({ agentName: process.env.AGENT_NAME ?? 'buyer-agent' }, async (ctx) => {
  const buyer = loadKeypairB58('BUYER_KEYPAIR_B58')
  const arbiter = SETTLEMENT_MODE === 'arbiter' ? loadKeypairB58('ARBITER_KEYPAIR_B58') : null
  console.error(`[buyer] market buyer - wallet=${buyer.publicKey.toBase58()} budget=${BUDGET} sellers=[${SELLERS.join(',')}] price=${PRICE_WEIGHT} reputation=${REPUTATION_WEIGHT}`)

  for (const s of SELLERS) {
    try { await ctx.waitForAgent(s, 8000) } catch { /* seller may already be present */ }
  }
  const thread = await ctx.createThread('market', SELLERS)
  const program = await makeProgram(buyer, RPC)
  if (arbiter) {
    await ensureArbiterConfig(buyer, arbiter.publicKey, RPC)
    await ensureArbiterFunded(buyer, arbiter.publicKey, RPC)
  }
  let round = 0

  while (true) {
    try {
      round++
      const arg = ARGS[(round - 1) % ARGS.length] // rotate fixtures so consecutive rounds differ
      if (trace) console.error(`[buyer] round ${round}: WANT ${SERVICE} ${arg} budget=${BUDGET}`)
      await ctx.send(formatWant({ round, service: SERVICE, arg, budgetSol: BUDGET }), thread, SELLERS)

      // -- collect competing bids during the window --------------------------
      const bids: Bid[] = []
      const deadline = Date.now() + BID_WINDOW_MS
      while (Date.now() < deadline) {
        const m = await ctx.waitForMention(Math.max(500, deadline - Date.now()))
        if (!m) continue
        const b = parseBid(m.text)
        if (b && b.round === round) bids.push(b)
      }
      const pool = selectBids(bids, round)
      if (pool.length === 0) { console.error(`[buyer] round ${round}: NO_SELLERS`); await sleep(CYCLE_MS); continue }

      // -- award: price AND on-chain-proven reputation, not price alone ------
      const { scores, winner } = scoreBids(pool)
      console.error(`[buyer] round ${round}: scores ${JSON.stringify(scores)}`)
      await ctx.send(`SCORES round=${round} ${JSON.stringify(scores)}`, thread, SELLERS)
      const reason = `price ${Math.round(PRICE_WEIGHT * 100)}% + reputation ${Math.round(REPUTATION_WEIGHT * 100)}% -> score ${scores[winner.by].total}`
      await ctx.send(formatAward(round, winner.by, reason), thread, [winner.by])

      // -- settle through escrow: deposit -> DEPOSITED -> wait DELIVERED -> release
      const terms = await waitFor<EscrowTerms>(ctx, round, parseEscrowRequired, 15_000)
      if (!terms) {
        console.error(`[buyer] round ${round}: no escrow terms from ${winner.by}`)
        bumpReputation(winner.by, 'failed')
        await sleep(CYCLE_MS); continue
      }
      if (!payoutMatches(terms.seller, EXPECTED_SELLER_WALLET)) {
        console.error(`[buyer] round ${round}: escrow payout ${terms.seller} != expected ${EXPECTED_SELLER_WALLET} - skipping`)
        bumpReputation(winner.by, 'failed')
        await sleep(CYCLE_MS); continue
      }

      const reference = new PublicKey(terms.reference)
      const seller = new PublicKey(terms.seller)
      const requestedSettlement = terms.settlement ?? (SETTLEMENT_MODE === 'direct' ? 'direct' : 'arbiter')
      let depositSig: string
      let vault: PublicKey | undefined
      if (requestedSettlement === 'arbiter') {
        if (!arbiter) throw new Error('ARBITER_KEYPAIR_B58 is required for SETTLEMENT_MODE=arbiter')
        const opened = await openArbitrated(makeArbiter(buyer, RPC), buyer, seller, reference, terms.amountSol, terms.deadlineSecs)
        depositSig = opened.sig
        vault = opened.vault
      } else {
        depositSig = await deposit(program, buyer, seller, reference, terms.amountSol, terms.deadlineSecs)
      }
      console.error(`[buyer] round ${round}: DEPOSITED ${terms.amountSol} SOL -> ${winner.by}`)
      if (trace) {
        if (requestedSettlement === 'arbiter' && vault) {
          console.error(`[buyer]   arbiter: ${expl('address', ARBITER_PROGRAM_ID.toBase58())}`)
          console.error(`[buyer]   vault PDA: ${expl('address', vault.toBase58())}`)
          console.error(`[buyer]   escrow PDA: ${expl('address', arbitratedEscrowPda(vault, reference).toBase58())}`)
          console.error(`[buyer]   open tx: ${expl('tx', depositSig)}`)
        } else {
          console.error(`[buyer]   escrow PDA: ${expl('address', escrowPda(buyer.publicKey, reference).toBase58())}`)
          console.error(`[buyer]   deposit tx: ${expl('tx', depositSig)}`)
        }
      }
      await ctx.send(
        formatDeposited({
          round,
          reference: terms.reference,
          buyer: buyer.publicKey.toBase58(),
          sig: depositSig,
          settlement: requestedSettlement,
          ...(vault && arbiter ? { vault: vault.toBase58(), arbiter: arbiter.publicKey.toBase58() } : {}),
        }),
        thread, [winner.by],
      )

      const delivered = await waitFor(ctx, round, (t) => {
        const r = messageRound(t)
        return verb(t) === 'DELIVERED' && r != null ? { round: r } : null
      }, 30_000)

      if (delivered) {
        const releaseSig = requestedSettlement === 'arbiter' && arbiter
          ? await arbitrateRelease(makeArbiter(arbiter, RPC), arbiter, seller, reference)
          : await release(program, buyer, seller, reference)
        const releaseVerb = requestedSettlement === 'arbiter' ? 'ARBITER_RELEASED' : 'RELEASED'
        console.error(`[buyer] round ${round}: ${releaseVerb} to ${winner.by} - ${expl('tx', releaseSig)}`)
        await ctx.send(`${releaseVerb} round=${round} sig=${releaseSig} settlement=${requestedSettlement}`, thread, [winner.by])
        bumpReputation(winner.by, 'completed')
      } else {
        console.error(`[buyer] round ${round}: no delivery - funds stay in escrow, refundable after the deadline`)
        bumpReputation(winner.by, 'failed')
      }
    } catch (e) {
      console.error(`[buyer] round error: ${e}`)
    }
    await sleep(CYCLE_MS)
  }
})