import { useEffect } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import Noise from '../reactbits/Noise'
import { Barcode } from './Ephemera'

function Masthead() {
  return (
    <header className="masthead">
      <div className="page masthead__inner">
        <Link to="/" className="wordmark" aria-label="LogSight home">
          <span style={{ width: '2.2rem' }}>
            <Barcode value="logsight" bars={14} />
          </span>
          LogSight
        </Link>
        <nav aria-label="Main">
          <Link to="/#how" className="nav-optional">
            How it works
          </Link>
          <NavLink to="/runs">Runs</NavLink>
          <Link to="/upload" className="btn btn--small">
            Upload a log
          </Link>
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

export default function Chrome() {
  return (
    <>
      <ScrollToTop />
      <Masthead />
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <div className="grain" aria-hidden="true">
        {/* Paper grain is drawn once: the refresh interval is longer than any session. */}
        <Noise patternAlpha={9} patternRefreshInterval={Number.MAX_SAFE_INTEGER} />
      </div>
    </>
  )
}
