import { useEffect, useRef, useState } from 'react'
import { CalendarPane } from './components/CalendarPane'
import { DayDetail } from './components/DayDetail'
import { Header } from './components/Header'
import { LogSightingFlow } from './components/LogSightingFlow'
import { PlaceholderPane } from './components/PlaceholderPane'
import { RecentCritters } from './components/RecentCritters'
import { Sheet } from './components/Sheet'
import { SightingDetail } from './components/SightingDetail'
import { Tabs, type Tab } from './components/Tabs'
import { Toast } from './components/Toast'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useSightings } from './hooks/useSightings'

const PANE_LABELS: Record<Tab, string> = {
  calendar: 'Calendar',
  history: 'History',
  leaderboard: 'Top Critters',
}

type SheetState =
  | null
  | { kind: 'log' }
  | { kind: 'day'; date: string }
  | { kind: 'sighting'; id: string; fromDay?: string }

export default function App() {
  const { sightings, status, addSighting, removeSighting, retry } = useSightings()
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  const [sheet, setSheet] = useState<SheetState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(message: string) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  const openSighting = (id: string, fromDay?: string) => setSheet({ kind: 'sighting', id, fromDay })

  const logButton = (
    <button type="button" className="log-button" onClick={() => setSheet({ kind: 'log' })}>
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
            <div role="tabpanel" id={'pane-' + activeTab}>
              {activeTab === 'calendar' ? (
                <CalendarPane sightings={sightings} onDayOpen={(date) => setSheet({ kind: 'day', date })} />
              ) : (
                <PlaceholderPane label={PANE_LABELS[activeTab]} />
              )}
              {activeTab === 'calendar' && !isDesktop && (
                <RecentCritters
                  sightings={sightings}
                  status={status}
                  onRetry={retry}
                  onSelect={(id) => openSighting(id)}
                />
              )}
            </div>
          </main>
          <aside className="sidebar desktop-only">
            {logButton}
            {isDesktop && (
              <RecentCritters
                sightings={sightings}
                status={status}
                onRetry={retry}
                onSelect={(id) => openSighting(id)}
              />
            )}
          </aside>
        </div>
      </div>
      <LogSightingFlow
        open={sheet?.kind === 'log'}
        onClose={() => setSheet(null)}
        onSave={addSighting}
        onLogged={() => {
          setSheet(null)
          showToast('🎉 Logged!')
        }}
      />
      {sheet?.kind === 'day' && (
        <Sheet open onClose={() => setSheet(null)}>
          <DayDetail
            date={sheet.date}
            sightings={sightings.filter((s) => s.sightedOn === sheet.date)}
            onSelect={(id) => openSighting(id, sheet.date)}
            onClose={() => setSheet(null)}
          />
        </Sheet>
      )}
      {sheet?.kind === 'sighting' &&
        (() => {
          const selected = sightings.find((s) => s.id === sheet.id)
          if (selected === undefined) return null
          return (
            <Sheet open onClose={() => setSheet(null)}>
              <SightingDetail
                sighting={selected}
                onBack={() =>
                  setSheet(sheet.fromDay !== undefined ? { kind: 'day', date: sheet.fromDay } : null)
                }
                onDeleted={() => setSheet(null)}
                removeSighting={removeSighting}
              />
            </Sheet>
          )
        })()}
      <Toast message={toast} />
    </div>
  )
}
