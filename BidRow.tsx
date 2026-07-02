import type { RoundBid, ScoredBid } from '../types'
import { Avatar } from './Avatar'

export function BidRow({ bid, won, score }: { bid: RoundBid; won: boolean; score?: ScoredBid }) {
  return (
    <div className={`bid ${won ? 'bid-won' : ''}`} data-testid="bid" data-seller={bid.by}>
      <Avatar seller={bid.by} />
      <span className="bid-seller">{bid.by}</span>
      <span className="bid-price">{bid.priceSol} SOL</span>
      {score && (
        <span className="bid-score" data-testid="bid-score" title={`price score ${score.priceScore} + reputation ${score.repPct}%`}>
          rep {score.repPct}% · score {score.total}
        </span>
      )}
      {bid.note && <span className="bid-note">{bid.note}</span>}
      {won && <span className="bid-tag">🏆 won</span>}
    </div>
  )
}

export function DeclinedRow({ seller }: { seller: string }) {
  return (
    <div className="bid bid-declined" data-testid="declined" data-seller={seller}>
      <Avatar seller={seller} size0} />
      <span className="bid-seller">{seller}</span>
      <span className="bid-note">declined — not in inventory</span>
    </div>
  )
}
