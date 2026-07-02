import { useEffect, useRef, useState } from 'react'
import type { Feed } from './types'

const FEED_URL = import.meta.env.VITE_FEED_URL ?? ''

export async function startMarket(failRounds?: string): Promise<string> {
  const r = await fetch(`${FEED_URL}/api/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(failRounds ? { failRounds } : {}),
  })
  const body = (await r.json()) as { session?: string; error?: string }
  if (!r.ok || !body.session) throw new Error(body.error ?? `start failed (${r.status})`)
  return body.session
}

export interface FeedState {
  rounds: Feed['rounds']
  connected: boolean
  error?: string
}

export function useFeed(session: string, intervalMs = 1000): FeedState {
  const [state, setState] = useState<FeedState>({ rounds: [], connected: false })
  const stop = useRef(false)

  useEffect(() => {
    stop.current = false
    if (!session) {
      setState({ rounds: [], connected: false, error: 'no session' })
      return
    }
    const tick = async () => {
      try {
        const r = await fetch(`${FEED_URL}/api/feed?session=${encodeURIComponent(session)}`)
        if (!r.ok) throw new Error(`feed ${r.status}`)
        const feed = (await r.json()) as Feed
        if (!stop.current) setState({ rounds: feed.rounds ?? [], connected: true })
      } catch (e) {
        if (!stop.current) setState((s) => ({ ...s, connected: false, error: (e as Error).message }))
      }
    }
    void tick()
    const id = setInterval(tick, intervalMs)
    return () => { stop.current = true; clearInterval(id) }
  }, [session, intervalMs])

  return state
}
