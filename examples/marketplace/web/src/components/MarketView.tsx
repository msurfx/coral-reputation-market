import type { Round } from '../types'
import { RoundCard } from './RoundCard'
import { Standings } from './Standings'
import { TimedProgress } from './TimedProgress'

/** The live market feed — newest round first, with a standings table above it.
 * connected/feedError let this distinguish "still early" from "actually broken". */
export function MarketView({ rounds, connected, feedError }: { rounds: Round[]; connected: boolean; feedError?: string }) {
  if (rounds.length === 0) {
    if (!connected && feedError) {
      return (
        <div className="pending pending-error" data-testid="feed-error">
          <p className="pending-text">Lost connection to the feed — {feedError}. Retrying…</p>
        </div>
      )
    }
    return <TimedProgress label="Waiting for the buyer to broadcast a WANT…" maxMs={40_000} />
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
