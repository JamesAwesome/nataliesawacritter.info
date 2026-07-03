import { useEffect, useState } from 'react'

type HealthState = 'loading' | 'connected' | 'unavailable'

export default function App() {
  const [health, setHealth] = useState<HealthState>('loading')

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((res) => res.json())
      .then((body: { db: boolean }) => {
        if (!cancelled) setHealth(body.db ? 'connected' : 'unavailable')
      })
      .catch(() => {
        if (!cancelled) setHealth('unavailable')
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="shell">
      <header className="header">
        <h1>🐾 Natalie Saw a Critter!</h1>
      </header>
      <p className="status" role="status">
        {health === 'loading' && 'Checking the burrow…'}
        {health === 'connected' && 'Database connected 🎉'}
        {health === 'unavailable' && 'Database unavailable 😿'}
      </p>
    </main>
  )
}
