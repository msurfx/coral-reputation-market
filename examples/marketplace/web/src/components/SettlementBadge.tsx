import { explorerTx, solscanTx } from '../types'

/** A settlement step with clickable devnet Explorer + Solscan links for its signature. */
export function SettlementBadge({ label, sig }: { label: string; sig: string }) {
  return (
    <span className="settle-group" data-testid="settle">
      <span className="settle-label">{label}</span>
      <a className="settle" href={explorerTx(sig)} target="_blank" rel="noreferrer">Explorer ↗</a>
      <a className="settle" href={solscanTx(sig)} target="_blank" rel="noreferrer">Solscan ↗</a>
    </span>
  )
}
