export type Tab = 'calendar' | 'history' | 'leaderboard'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'calendar', label: 'Calendar' },
  { id: 'history', label: 'History' },
  { id: 'leaderboard', label: 'Top Critters' },
]

type Props = { active: Tab; onChange: (tab: Tab) => void }

export function Tabs({ active, onChange }: Props) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          className={`tab tab-${t.id}${active === t.id ? ' tab-active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  )
}
