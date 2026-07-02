import type { Round } from '../types'
import { RoundCard } from './RoundCard'
import { Standings } from './Standings'

/** The live market feed — newest round first, with a standings table above it. */
export function MarketView({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0) {
    return (
      <div className="pending" data-testid="empty">
        <div className="pending-bar"><div className="pending-fill" /></div>
        <p className="pending-text">Waiting for the buyer to broadcast a WANT…</p>
      </div>
    )
  }
  const newestFirst = [...rounds].sort((a, b) => b.round - a.round)
  return (
    <div className="market" data-testid="market">
      <Standings rounds={rounds} />
      {newestFirst.map((r) => (
        <RoundCard key={r.round} round={r} />
      ))}
    </div>
  )
}
