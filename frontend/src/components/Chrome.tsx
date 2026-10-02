import { useEffect } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Barcode } from './Ephemera'

function Masthead() {
  return (
    <header className="masthead">
      <div className="page masthead__inner">
        <Link to="/" className="wordmark" aria-label="LogSight home">
          <span className="wordmark__bars"><Barcode value="logsight" bars={14} /></span>
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
