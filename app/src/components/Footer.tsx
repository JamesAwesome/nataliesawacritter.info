export function Footer() {
  const year = new Date().getFullYear()
  return (
    <footer className="app-footer">
      © {year} ·{' '}
      <a href="https://github.com/JamesAwesome/nataliesawacritter.info" target="_blank" rel="noopener noreferrer">
        James Awesome
      </a>{' '}
      ·{' '}
      <a
        className="footer-rss"
        href="/feed.xml"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="RSS feed"
      >
        <img src="/rss.svg" alt="" />
      </a>
    </footer>
  )
}
