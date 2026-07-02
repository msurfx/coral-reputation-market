import { useState } from 'react'
import { useFeed, startMarket } from './api'
import { MarketView } from './components/MarketView'
import { Explainer } from './components/Explainer'
import { Logo } from './components/Logo'
import { TimedProgress } from './components/TimedProgress'

const initialSession = new URLSearchParams(window.location.search).get('session') ?? ''

export default function App() {
  const [session, setSession] = useState(initialSession)
  const [starting, setStarting] = useState(false)
  const [startErr, setStartErr] = useState<string>()
  const [stageFailure, setStageFailure] = useState(false)
  const { rounds, connected, error } = useFeed(session)

  async function onStart() {
    setStarting(true)
    setStartErr(undefined)
    try {
      const id = await startMarket(stageFailure ? '2,3' : undefined)
      setSession(id)
      const url = new URL(window.location.href)
      url.searchParams.set('session', id)
      window.history.replaceState({}, '', url)
    } catch (e) {
      setStartErr((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="app">
      <header className="app-head">
        <Logo />
        <div className="wordmark-block">
          <h1>The Agent Marketplace</h1>
          <span className="sub">LLM agents compete on CoralOS · settled by Solana escrow</span>
        </div>
        <span className={`dot ${connected ? 'dot-on' : 'dot-off'}`} data-testid="conn" title={connected ? 'connected' : (error ?? 'disconnected')} />
      </header>

      <div className="session-bar">
        <input
          aria-label="session id"
          placeholder="paste a market session id…"
          value={session}
          onChange={(e) => setSession(e.target.value.trim())}
        />
        <button onClick={onStart} disabled={starting} data-testid="start">
          {starting ? 'starting…' : 'Start a market'}
        </button>
      </div>

      <label className="stage-toggle">
        <input
          type="checkbox"
          checked={stageFailure}
          onChange={(e) => setStageFailure(e.target.checked)}
          data-testid="stage-failure"
        />
        stage a reputation drop
        <span className="stage-hint"> — seller-cheap no-shows rounds 2 &amp; 3, watch a pricier seller overtake it</span>
      </label>

      {starting && <TimedProgress label="Creating the market session…" maxMs={30_000} />}
      {startErr && <p className="start-err" data-testid="start-err">Couldn't start the market — {startErr}</p>}

      <Explainer />

      <main>
        {session && !starting ? <MarketView rounds={rounds} connected={connected} feedError={error} /> : (
          !starting && <p className="empty">Fund your wallets, then <strong>Start a market</strong> — agents will bid and settle live.</p>
        )}
      </main>
    </div>
  )
}
