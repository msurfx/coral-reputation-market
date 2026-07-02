/**
 * Escrow settlement - SELLER side (read-only).
 *
 * The seller never signs on-chain; it only checks "is money locked for me?" before delivering
 * (release is the buyer's call). The IDL is fetched from the deployed program, so nothing needs
 * bundling. PROGRAM_ID matches the devnet deployment.
 *
 * These reads hit the escrow program deployed to devnet (see PROGRAM_ID); they need live RPC, so they
 * run in a live market session, not in `npm test`/CI.
 */
import anchor from '@coral-xyz/anchor'
import type { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { solanaConnection } from '@pay/agent-runtime'
const { AnchorProvider } = anchor

export const PROGRAM_ID = new PublicKey('R5NWNg9eRLWWQU81Xbzz5Du1k7jTDeeT92Ty6qCeXet')

/** Retry a flaky public-RPC call with backoff — a single transient fetch failure shouldn't crash
 * the whole agent (devnet's shared public RPC rate-limits/hiccups under load). */
async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      console.error(`[escrow] RPC call failed (attempt ${i + 1}/${attempts}): ${(e as Error).message}`)
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
    }
  }
  throw lastErr
}

/** Per-order escrow PDA: one per (buyer, reference). */
export function escrowPda(buyer: PublicKey, reference: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyer.toBuffer(), reference.toBuffer()],
    PROGRAM_ID,
  )[0]
}

/** Read-only Program handle (a throwaway wallet - the seller never signs). */
export async function makeProgram(rpcUrl: string): Promise<Program> {
  const provider = new AnchorProvider(
    solanaConnection(rpcUrl),
    new anchor.Wallet(Keypair.generate()),
    { commitment: 'confirmed' },
  )
  const idl = await withRetry(() => anchor.Program.fetchIdl(PROGRAM_ID, provider))
  if (!idl) throw new Error('escrow IDL not found on-chain - is the program deployed to this cluster?')
  return new anchor.Program(idl, provider)
}

/** Is a funded escrow present for (buyer, reference) naming `seller`, holding >= `minAmountSol`? */
export async function isFunded(
  program: Program,
  buyer: PublicKey,
  seller: PublicKey,
  reference: PublicKey,
  minAmountSol = 0,
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct = await withRetry<any>(() => (program.account as any).escrow.fetchNullable(escrowPda(buyer, reference)))
  if (!acct) return false
  return (
    acct.buyer.equals(buyer) &&
    acct.seller.equals(seller) &&
    acct.amount.toNumber() >= Math.round(minAmountSol * LAMPORTS_PER_SOL)
  )
}
