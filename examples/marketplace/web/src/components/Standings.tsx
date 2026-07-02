import type { Round, ScoredBid } from '../types'
import { Avatar } from './Avatar'

interface StandingRow {
  seller: string
  repPct: number
  price: number
  total: number
  wins: number
  played: number
}

const MEDAL = ['🥇', '🥈', '🥉']

function computeStandings(rounds: Round[]): StandingRow[] {
  const latest: Record<string, ScoredBid> = {}
  const wins: Record<string, number> = {}
  const played: Record<string, number> = {}

  for (const r of [...rounds].sort((a, b) => a.round - b.round)) {
    if (r.scores) {
      for (const [name, s] of Object.entries(r.scores)) {
        latest[name] = s
        played[name] = (played[name] ?? 0) + 1
      }
    }
    if (r.award?.to && r.status === 'settled') {
      wins[r.award.to] = (wins[r.award.to] ?? 0) + 1
    }
  }

  return Object.entries(latest)
    .map(([seller, s]) => ({
      seller, repPct: s.repPct, price: s.price, total: s.total,
      wins: wins[seller] ?? 0, played: played[seller] ?? 0,
    }))
    .sort((a, b) => b.repPct - a.repPct || b.total - a.total)
}

export function Standings({ rounds }: { rounds: Round[] }) {
  const rows = computeStandings(rounds)
  if (rows.length === 0) return null
  return (
    <section className="standings" data-testid="standings">
      <h2 className="standings-head">League table <span className="standings-sub">reputation-weighted</span></h2>
      <div className="standings-rows">
        {rows.map((row, i) => (
          <div className="standings-row" key={row.seller} data-testid="standing" data-seller={row.seller}>
            <span className="standings-rank">{MEDAL[i] ?? `#${i + 1}`}</span>
            <Avatar seller={row.seller} />
            <span className="standings-name">{row.seller}</span>
            <span className="standings-rep" title="reputation">{row.repPct}% rep</span>
            <span className="standings-price">{row.price} SOL</span>
            <span className="standings-wins">{row.wins}/{row.played} won</span>
          </div>
        ))}
      </div>
    </section>
  )
}
