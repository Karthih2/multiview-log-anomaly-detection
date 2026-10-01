import { Link } from 'react-router-dom'
import '../styles/landing.css'

export function TermsPage() {
  return (
    <article className="page legal">
      <h1 className="display">Terms of service</h1>
      <p className="lede">
        LogSight is software you run on your own machine or server. These terms describe what it is
        and is not responsible for. Replace them with your organisation's own terms before offering
        it to anyone else.
      </p>

      <h2>What the service does</h2>
      <p>
        You upload a log file. LogSight analyses it and stores the results so that you can read them
        in the report pages. Nothing else is done with the file.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Only upload logs you are allowed to process.</li>
        <li>Remove secrets and personal data from a log before uploading it if you do not want them stored.</li>
        <li>Delete runs you no longer need from the <Link to="/runs">Runs</Link> page.</li>
      </ul>

      <h2>No guarantee of accuracy</h2>
      <p>
        Anomaly flags, severity ratings and root-cause candidates are statistical estimates. They can
        miss real problems and flag harmless events. Do not use them as the sole basis for an
        operational, safety or security decision.
      </p>

      <h2>No warranty</h2>
      <p>
        The software is provided as it is, without warranty of any kind. The people who wrote it are
        not liable for loss or damage that comes from using it.
      </p>

      <h2>Access</h2>
      <p>
        This version has no sign-in. Anyone who can reach the server can see and delete every run, so
        keep it on a network you trust.
      </p>
    </article>
  )
}

export function PrivacyPage() {
  return (
    <article className="page legal">
      <h1 className="display">Privacy policy</h1>
      <p className="lede">
        LogSight keeps what you upload on the server it runs on. This page lists exactly what is
        stored and what is sent elsewhere.
      </p>

      <h2>What is stored</h2>
      <ul>
        <li>The log file you upload, kept in the server's storage folder.</li>
        <li>Every readable line of that log, with the scores and flags computed for it, in the server's database.</li>
        <li>The name you gave the run and when it was created.</li>
      </ul>

      <h2>What is not collected</h2>
      <ul>
        <li>No account, name or email address. There is no sign-in.</li>
        <li>No cookies, analytics or tracking scripts.</li>
      </ul>

      <h2>What leaves the server</h2>
      <p>
        Log content is not sent to any outside service. The first time a run needs the sentence
        embedding model, the server downloads that model from Hugging Face; that request carries no
        log data.
      </p>

      <h2>Sensitive content in logs</h2>
      <p>
        Logs can contain user names, addresses or tokens. LogSight stores lines as they are and does
        not redact them. Clean a log before uploading it if that matters to you.
      </p>

      <h2>Deleting data</h2>
      <p>
        Deleting a run on the <Link to="/runs">Runs</Link> page removes its lines, results and the
        uploaded file from the server.
      </p>
    </article>
  )
}

export function NotFoundPage() {
  return (
    <div className="page legal">
      <h1 className="display">No such page</h1>
      <p className="lede">That address does not lead anywhere.</p>
      <p style={{ marginTop: '1.5rem' }}>
        <Link to="/" className="btn">Back to the start</Link>
      </p>
    </div>
  )
}
