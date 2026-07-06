export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="app-footer">
      © {year} ·{' '}
      <a href="https://github.com/JamesAwesome" target="_blank" rel="noopener noreferrer">
        James Awesome
      </a>
    </footer>
  )
}
