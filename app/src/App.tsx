import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deletePhoto, likeSighting, unlikeSighting, uploadPhoto, type Sighting } from './api'
import { CalendarPane } from './components/CalendarPane'
import { DayDetail } from './components/DayDetail'
import { Footer } from './components/Footer'
import { Header } from './components/Header'
import { HistoryPane } from './components/HistoryPane'
import { LeaderboardList } from './components/LeaderboardList'
import { LogSightingFlow } from './components/LogSightingFlow'
import { RecentCritters } from './components/RecentCritters'
import { Sheet } from './components/Sheet'
import { SightingDetail } from './components/SightingDetail'
import { Tabs, type Tab } from './components/Tabs'
import { TopCrittersPane } from './components/TopCrittersPane'
import { Toast } from './components/Toast'
import { useIsDesktop } from './hooks/useIsDesktop'
import { useProfiles } from './hooks/useProfiles'
import { useSightings } from './hooks/useSightings'
import { friendKeys } from './lib/friends'
import { leaderboard, recentEmoji } from './lib/insights'
import { deviceId, hasLiked, markLiked, markUnliked } from './lib/likes'
import { sheetIsValid, type SheetState } from './lib/sheet'

export default function App() {
  const { sightings, status, addSighting, removeSighting, applySighting, retry } = useSightings()
  const { profiles, addProfile, removeProfile } = useProfiles()
  const isDesktop = useIsDesktop()
  const [activeTab, setActiveTab] = useState<Tab>('calendar')
  // Derivations reused in JSX below; memoized so unrelated re-renders (toast,
  // sheet open/close) don't recompute them.
  const topTen = useMemo(() => leaderboard(sightings).slice(0, 10), [sightings])
  const recent = useMemo(() => recentEmoji(sightings, 4), [sightings])
  const keys = useMemo(() => friendKeys(profiles), [profiles])
  const [sheet, setSheet] = useState<SheetState>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Self-heal: a detail sheet pointing at a vanished sighting closes instead
  // of lingering as stale state (the render guard already draws nothing).
  // Adjusted during render (React's "you might not need an effect" pattern)
  // rather than in a useEffect, so the fix lands before paint instead of
  // causing an extra commit.
  const [prevSightings, setPrevSightings] = useState(sightings)
  if (sightings !== prevSightings) {
    setPrevSightings(sightings)
    if (!sheetIsValid(sheet, sightings)) setSheet(null)
  }

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(message: string) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1800)
  }

  const openSighting = (id: string, fromDay?: string) => setSheet({ kind: 'sighting', id, fromDay })

  const toggleLike = useCallback(
    async (s: Sighting) => {
      const liked = hasLiked(s.id)
      // optimistic: flip local heart + count now, reconcile with the server after
      if (liked) markUnliked(s.id)
      else markLiked(s.id)
      applySighting({ ...s, likeCount: Math.max(0, s.likeCount + (liked ? -1 : 1)) })
      try {
        const { likeCount } = liked
          ? await unlikeSighting(s.id, deviceId())
          : await likeSighting(s.id, deviceId())
        applySighting({ ...s, likeCount })
      } catch {
        if (liked) markLiked(s.id)
        else markUnliked(s.id)
        applySighting(s) // roll back
      }
    },
    [applySighting],
  )

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
              <p className="flow-error" data-testid="app-error">
                Couldn't load sightings 😿{' '}
                <button type="button" className="link-button" onClick={retry}>
                  Retry
                </button>
              </p>
            )}
            <div role="tabpanel" id="pane-calendar" hidden={activeTab !== 'calendar'}>
              <CalendarPane sightings={sightings} onDayOpen={(date) => setSheet({ kind: 'day', date })} />
              {!isDesktop && (
                <RecentCritters
                  sightings={sightings}
                  status={status}
                  onRetry={retry}
                  onSelect={(id) => openSighting(id)}
                  onToggleLike={toggleLike}
                  friendKeys={keys}
                />
              )}
            </div>
            <div role="tabpanel" id="pane-history" hidden={activeTab !== 'history'}>
              <HistoryPane
                sightings={sightings}
                onSelect={(id) => openSighting(id)}
                onToggleLike={toggleLike}
                friendKeys={keys}
              />
            </div>
            <div role="tabpanel" id="pane-leaderboard" hidden={activeTab !== 'leaderboard'}>
              <TopCrittersPane sightings={sightings} />
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
                onToggleLike={toggleLike}
                friendKeys={keys}
              />
            )}
            {isDesktop && sightings.length > 0 && (
              <>
                <h2 className="sidebar-heading">Top Critters</h2>
                <LeaderboardList rows={topTen} />
              </>
            )}
          </aside>
        </div>
      </div>
      <Footer />
      <LogSightingFlow
        open={sheet?.kind === 'log'}
        onClose={() => setSheet(null)}
        onSave={addSighting}
        onLogged={() => {
          setSheet(null)
          showToast('🎉 Logged!')
        }}
        recent={recent}
        friends={profiles}
        onSaveFriend={addProfile}
        onRemoveFriend={removeProfile}
        onUploadPhoto={async (id, photo, authHeader) => {
          applySighting(await uploadPhoto(id, photo, authHeader))
        }}
      />
      {sheet?.kind === 'day' && (
        <Sheet open onClose={() => setSheet(null)}>
          <DayDetail
            date={sheet.date}
            sightings={sightings.filter((s) => s.sightedOn === sheet.date)}
            onSelect={(id) => openSighting(id, sheet.date)}
            onClose={() => setSheet(null)}
            onToggleLike={toggleLike}
            friendKeys={keys}
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
                profiles={profiles}
                addProfile={addProfile}
                removeProfile={removeProfile}
                uploadPhoto={async (id, photo, authHeader) => {
                  applySighting(await uploadPhoto(id, photo, authHeader))
                }}
                removePhoto={async (id, authHeader) => {
                  await deletePhoto(id, authHeader)
                  applySighting({ ...selected, photoPath: null })
                }}
                onToggleLike={toggleLike}
              />
            </Sheet>
          )
        })()}
      <Toast message={toast} />
    </div>
  )
}
