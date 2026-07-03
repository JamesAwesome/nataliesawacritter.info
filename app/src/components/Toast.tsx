type Props = { message: string | null }

export function Toast({ message }: Props) {
  if (message === null) return null
  return (
    <div className="toast" role="status">
      {message}
    </div>
  )
}
