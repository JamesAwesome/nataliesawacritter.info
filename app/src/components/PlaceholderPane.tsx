type Props = { label: string }

export function PlaceholderPane({ label }: Props) {
  return (
    <section className="card placeholder-pane">
      <p>
        {label} coming soon 🐾
      </p>
    </section>
  )
}
