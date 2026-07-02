/**
 * Escrow settlement - BUYER side (signs deposit / release / refund).
 *
 * The buyer locks funds in a per-order escrow PDA, releases on delivery, or refunds after the
 * deadline. The `reference` is the same key the seller issues - it seeds the PDA. IDL is fetched
 * from the deployed program.
 *
 * These calls settle against the escrow program deployed to devnet (see PROGRAM_ID); they need a
 * funded devnet wallet + live RPC, so they run in a live market session, not in `npm test`/CI.
 */
import anchor from '@coral-xyz/anchor'
import type { Program } from '@coral-xyz/anchor'
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js'
import { solanaConnection } from '@pay/agent-runtime'
const { AnchorProvider, BN } = anchor

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

export function escrowPda(buyer: PublicKey, reference: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('escrow'), buyer.toBuffer(), reference.toBuffer()],
    PROGRAM_ID,
  )[0]
}

/** Program handle signed by the buyer (deposits/releases/refunds). */
export async function makeProgram(buyer: Keypair, rpcUrl: string): Promise<Program> {
  const provider = new AnchorProvider(
    solanaConnection(rpcUrl),
    new anchor.Wallet(buyer),
    { commitment: 'confirmed' },
  )
  const idl = await withRetry(() => anchor.Program.fetchIdl(PROGRAM_ID, provider))
  if (!idl) throw new Error('escrow IDL not found on-chain - is the program deployed to this cluster?')
  return new anchor.Program(idl, provider)
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function deposit(
  program: Program,
  buyer: Keypair,
  seller: PublicKey,
  reference: PublicKey,
  amountSol: number,
  deadlineSecs: number,
): Promise<string> {
  const deadline = new BN(Math.floor(Date.now() / 1000) + deadlineSecs)
  return withRetry(() => (program.methods as any)
    .initialize(new BN(Math.round(amountSol * LAMPORTS_PER_SOL)), reference, deadline)
    .accounts({ buyer: buyer.publicKey, seller, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc())
}

export async function release(
  program: Program,
  buyer: Keypair,
  seller: PublicKey,
  reference: PublicKey,
): Promise<string> {
  return withRetry(() => (program.methods as any)
    .release()
    .accounts({ buyer: buyer.publicKey, seller, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc())
}

export async function refund(program: Program, buyer: Keypair, reference: PublicKey): Promise<string> {
  return withRetry(() => (program.methods as any)
    .refund()
    .accounts({ buyer: buyer.publicKey, escrow: escrowPda(buyer.publicKey, reference) })
    .signers([buyer])
    .rpc())
}
