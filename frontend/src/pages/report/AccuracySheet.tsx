import { Tally } from '../../components/Ephemera'
import { EmptyNotice } from '../../components/States'
import { formatInt, formatPercent, formatScore } from '../../lib/format'
import { HEADLINE_METRICS, metricCopy, scopeLabel } from '../../lib/vocabulary'
import { useReport } from './ReportLayout'

const AS_PERCENT = new Set(['precision', 'recall'])
const TEST_SCOPE = 'test'

function metricValue(key: string, value: number | null | undefined): string {
  return AS_PERCENT.has(key) ? formatPercent(value) : formatScore(value)
}

export default function AccuracySheet() {
  const { evaluation } = useReport()
  const test = evaluation.find((e) => e.scope === TEST_SCOPE)
  const others = evaluation.filter((e) => e.scope !== TEST_SCOPE)

  if (evaluation.length === 0) {
    return (
      <article className="sheet">
        <header className="sheet__head"><h1 className="display">Accuracy</h1></header>
        <EmptyNotice title="This log has no labels">
          <p>Accuracy can only be measured when the log marks which lines were real alerts.</p>
        </EmptyNotice>
      </article>
    )
  }

  return (
    <article className="sheet">
      <header className="sheet__head">
        <h1 className="display">Accuracy</h1>
        <p className="lede">
          This log marks which lines were real alerts. Those labels were never shown to the detectors.
          They are only used here, to check the flags on the last part of the log.
        </p>
      </header>

      {test && (
        <section className="sheet__section">
          <h2>On the held-out period</h2>
          <p className="muted">
            {formatInt(test.metrics.n_test_rows)} lines, of which {formatInt(test.metrics.n_true_anomalies)} were
            real alerts. {formatInt(test.metrics.n_flagged)} lines were flagged.
          </p>
          <Tally large rows={HEADLINE_METRICS.filter((key) => test.metrics[key as keyof typeof test.metrics] != null).map((key) => ({
            label: metricCopy(key).label,
            value: metricValue(key, test.metrics[key as keyof typeof test.metrics]),
            note: metricCopy(key).meaning,
          }))} />
        </section>
      )}

      {others.length > 0 && (
        <section className="sheet__section">
          <h2>Comparisons</h2>
          <p className="muted">
            The same check on slices of the data, and with single views or equal weights in place of
            reliability-weighted fusion.
          </p>
          <div className="table-scroll">
            <table className="metrics">
              <thead>
                <tr>
                  <th scope="col">Compared</th>
                  {HEADLINE_METRICS.map((key) => <th scope="col" key={key} className="num-cell">{metricCopy(key).label}</th>)}
                  <th scope="col" className="num-cell">Lines</th>
                </tr>
              </thead>
              <tbody>
                {others.map((entry) => (
                  <tr key={entry.scope}>
                    <th scope="row">{scopeLabel(entry.scope)}</th>
                    {HEADLINE_METRICS.map((key) => (
                      <td key={key} className="num-cell">{metricValue(key, entry.metrics[key as keyof typeof entry.metrics])}</td>
                    ))}
                    <td className="num-cell">{formatInt(entry.metrics.n_test_rows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </article>
  )
}
