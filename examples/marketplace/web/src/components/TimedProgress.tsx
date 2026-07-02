import { useEffect, useState } from 'react'

/** A progress bar grounded in a real ceiling (e.g. the server's own timeout), not a fake
 * indeterminate loop — fills toward ~92% over maxMs so it never falsely claims completion,
 * and the elapsed-seconds label makes a genuine stall visible instead of silent. */
export function TimedProgress({ label, maxMs = 30_000 }: { label: string; maxMs?: number }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const start = Date.now()
    const id = setInterval(() => setElapsed(Date.now() - start), 200)
    return () => clearInterval(id)
  }, [])
  const pct = Math.min(92, (elapsed / maxMs) * 92)
  const seconds = Math.floor(elapsed / 1000)
  const overtime = elapsed > maxMs
  return (
    <div className="pending" data-testid="pending">
      <div className="pending-bar">
        <div className={`pending-fill-timed ${overtime ? 'pending-fill-slow' : ''}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="pending-text">
        {label} <span className="pending-elapsed">({seconds}s{overtime ? ' — taking longer than usual' : ''})</span>
      </p>
    </div>
  )
}
