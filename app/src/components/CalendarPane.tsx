import { useMemo, useState } from 'react'
import type { Sighting } from '../api'
import { addMonths, currentYearMonth, monthGrid, monthLabel, todayString } from '../lib/calendar'
import { formatDay } from '../lib/format'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

type Props = {
  sightings: Sighting[]
  onDayOpen: (date: string) => void
}

export function CalendarPane({ sightings, onDayOpen }: Props) {
  const [visible, setVisible] = useState(currentYearMonth)
  // Memoized: the pane stays mounted (hidden) on other tabs; recompute the grid
  // only when the visible month or the sightings actually change.
  const cells = useMemo(
    () => monthGrid(visible.year, visible.month, sightings, todayString()),
    [visible.year, visible.month, sightings],
  )

  return (
    <section className="card calendar-card">
      <div className="calendar-strip" aria-hidden="true" />
      <div className="calendar-head">
        <button
          type="button"
          className="month-nav"
          aria-label="Previous month"
          onClick={() => setVisible((v) => addMonths(v.year, v.month, -1))}
        >
          ‹
        </button>
        <h2>{monthLabel(visible.year, visible.month)}</h2>
        <button
          type="button"
          className="month-nav"
          aria-label="Next month"
          onClick={() => setVisible((v) => addMonths(v.year, v.month, 1))}
        >
          ›
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="weekday">
            {d}
          </div>
        ))}
        {cells.map((cell) => {
          const classes = [
            'day-cell',
            cell.inMonth ? '' : 'out-month',
            cell.isToday ? 'today' : '',
            cell.inMonth && cell.sightings.length > 0 ? 'has-sightings' : '',
          ]
            .filter(Boolean)
            .join(' ')
          const emoji = cell.sightings.slice(0, 2).map((s) => s.emoji).join('')
          const overflow = cell.sightings.length - 2
          const body = (
            <>
              <span className="day-num">{cell.dayOfMonth}</span>
              {cell.inMonth && cell.sightings.length > 0 && (
                <span className="day-emoji">
                  {emoji}
                  {overflow > 0 ? ` +${overflow}` : ''}
                </span>
              )}
            </>
          )
          if (cell.inMonth && cell.sightings.length > 0) {
            const count = cell.sightings.length
            return (
              <button
                key={cell.date}
                type="button"
                className={classes}
                aria-label={`${formatDay(cell.date)}, ${count} sighting${count === 1 ? '' : 's'}`}
                onClick={() => onDayOpen(cell.date)}
              >
                {body}
              </button>
            )
          }
          return (
            <div key={cell.date} className={classes}>
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}
