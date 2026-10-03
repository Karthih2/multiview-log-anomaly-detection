import { useEffect } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

/** The favicon, drawn inline (same bars, same colours) so the mark and the browser tab match. */
function WordmarkMark() {
  return (
    <svg className="wordmark__mark" viewBox="0 0 32 32" width="32" height="32" shapeRendering="crispEdges" aria-hidden="true">
      <rect width="32" height="32" fill="var(--mark-bg)" />
      <path fill="var(--mark-fg)" d="M6 7h3v18H6zm5 0h1.5v18H11zm4 0h4v18h-4zm6 0h1.5v18H21zm3.5 0H26v18h-1.5z" />
      <rect className="wordmark__scan" x="0" y="0" width="2" height="32" fill="var(--mark-bg)" opacity="0" />
    </svg>
  )
}

function Masthead() {
  return (
    <header className="masthead">
      <div className="page masthead__inner">
        <Link to="/" className="wordmark" aria-label="LogSight home">
          <WordmarkMark />
          <span className="wordmark__text">LogSight</span>
        </Link>
        <nav aria-label="Main">
          <Link to="/#how" className="nav-optional">How it works</Link>
          <NavLink to="/runs">Runs</NavLink>
          <Link to="/upload" className="btn btn--small">Upload a log</Link>
        </nav>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="page footer__inner">
        <p>LogSight. Batch log anomaly detection, self-hosted.</p>
        <nav aria-label="Legal">
          <Link to="/terms">Terms of service</Link>
          <Link to="/privacy">Privacy policy</Link>
        </nav>
      </div>
    </footer>
  )
}

/** On navigation, go to the named section if the address has one, else to the top. */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    const target = hash ? document.getElementById(hash.slice(1)) : null
    if (target) target.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

/** Content loads after first paint and moves things down; keep scroll-in triggers aligned with the page. */
function RefreshTriggers() {
  useEffect(() => {
    let timer: number | undefined
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => ScrollTrigger.refresh(), 150)
    })
    observer.observe(document.body)
    return () => { observer.disconnect(); window.clearTimeout(timer) }
  }, [])
  return null
}

export default function Chrome() {
  return (
    <>
      <div className="backdrop" aria-hidden="true" />
      <ScrollToTop />
      <RefreshTriggers />
      <Masthead />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
