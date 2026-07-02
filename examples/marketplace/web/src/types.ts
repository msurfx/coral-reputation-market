// The feed server's API contract (mirrors marketplace-feed's Round). Kept here so the browser bundle
// never imports the node-side runtime/anchor/web3 code.

export interface RoundBid {
  by: string
  priceSol: number
  note?: string
}

export interface ScoredBid {
  by: string
  price: number
  priceScore: number
  repPct: number
  total: number
}

export type RoundStatus = 'bidding' | 'awarded' | 'deposited' | 'delivered' | 'settled' | 'refunded'

export interface Round {
  round: number
  want?: { service: string; arg: string; budgetSol: number }
  bids: RoundBid[]
  declined: string[]
  scores?: Record<string, ScoredBid>
  award?: { to: string; reason?: string }
  escrow?: { reference: string; seller: string; amountSol: number; deadlineSecs: number }
  deposit?: { sig: string; buyer: string }
  delivered?: { raw: string; data?: unknown }
  release?: { sig: string }
  refunded?: boolean
  status: RoundStatus
}

export interface Feed {
  session: string
  rounds: Round[]
  updatedAt: string
}

export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}?cluster=devnet`