import { useEffect, useRef, useState } from 'react'
import { Header } from './components/Header'
import { LogSightingFlow } from './components/LogSightingFlow'
import { PlaceholderPane } from './components/PlaceholderPane'
import { RecentCritters } from './components/RecentCritters'
import { Tabs, type Tab } from './components/Tabs'
import { Toast } from './components/Toast'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useSightings } from './hooks/useSightings'

const PANE_LABELS: Record<Tab, string> = {
  calendar: 'Calendar',
  history: 'History',
  leaderboard: 'Top Critters',
}

export default function App() {
  const { sightings, status, addSighting, retry } = useSightings()
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const [logOpen, setLogOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(message: string) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  const logButton = (
    <button type="button" className="log-button" onClick={() => setLogOpen(true)}>
      + Log a sighting
    </button>
  )

  return (
    <div className="page">
      <div className="shell">
        <Header />
        <Tabs active={activeTab} onChange={setActiveTab} />
        <div className="columns">
          <main className="main-col">
            <div className="mobile-only">{logButton}</div>
            {status === 'error' && (
              <p className="flow-error">
                Couldn't load sightings 😿{' '}
                <button type="button" className="link-button" onClick={retry}>
                  Retry
                </button>
              </p>
            )}
            <PlaceholderPane label={PANE_LABELS[activeTab]} />
            {activeTab === 'calendar' && !isDesktop && (
              <div className="mobile-only">
                <RecentCritters sightings={sightings} status={status} onRetry={retry} />
              </div>
            )}
          </main>
          <aside className="sidebar desktop-only">
            {logButton}
            {isDesktop && <RecentCritters sightings={sightings} status={status} onRetry={retry} />}
          </aside>
        </div>
      </div>
      <LogSightingFlow
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSave={addSighting}
        onLogged={() => {
          setLogOpen(false)
          showToast('🎉 Logged!')
        }}
      />
      <Toast message={toast} />
    </div>
  )
}
