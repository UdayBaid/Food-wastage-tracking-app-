import { AlertTriangle, CircleDollarSign, Scale, TrendingUp } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useApiData, getData } from '../hooks/useApiData'
import { getAllRecords } from '../services/api'
import { currency, number, shortDate } from '../utils/format'

function makeAlerts(records, trends) {
  const alerts = []
  for (const row of records) {
    const wasteRate = Number(row.waste_percentage ?? (row.food_prepared_kg ? row.food_wasted_kg / row.food_prepared_kg * 100 : 0))
    if (wasteRate >= 20) alerts.push({
      id: `waste-${row.id}`, kind: 'waste', icon: Scale, title: 'High food waste recorded',
      detail: `${row.meal_category} on ${shortDate(row.date)} recorded ${number(wasteRate)}% waste.`,
      metric: `${number(row.food_wasted_kg)} kg`,
    })
    if (Number(row.estimated_waste_cost_inr || 0) >= 1000) alerts.push({
      id: `cost-${row.id}`, kind: 'cost', icon: CircleDollarSign, title: 'High estimated waste cost',
      detail: `${row.meal_category} on ${shortDate(row.date)} exceeded the ₹1,000 frontend review threshold.`,
      metric: currency(row.estimated_waste_cost_inr),
    })
  }

  const days = trends.trends || []
  if (days.length >= 5) {
    const latest = days.at(-1)
    const baseline = days.slice(0, -1).reduce((sum, item) => sum + Number(item.waste_percentage || 0), 0) / (days.length - 1)
    if (baseline > 0 && Number(latest.waste_percentage) >= baseline * 1.5) alerts.push({
      id: 'pattern-latest', kind: 'pattern', icon: TrendingUp, title: 'Unusual waste pattern to review',
      detail: `The latest daily waste percentage is at least 1.5× the average of earlier returned days.`,
      metric: `${number(latest.waste_percentage)}% vs ${number(baseline)}%`,
    })
  }
  return alerts.sort((a, b) => ({ waste: 0, pattern: 1, cost: 2 }[a.kind] - { waste: 0, pattern: 1, cost: 2 }[b.kind]))
}

export default function Alerts() {
  const { data, loading, error, refresh } = useApiData(() => Promise.all([
    getAllRecords(),
    getData('/analytics/trends', { params: { period: 'daily' } }),
  ]).then(([records, trends]) => ({ records, trends })), [])
  const alerts = data ? makeAlerts(data.records.records, data.trends) : []

  return <>
    <PageHeader eyebrow="KITCHEN REVIEW QUEUE" title="Signals worth a closer look." description="Frontend-generated review prompts based on recorded meals; the backend does not provide an alert feed." />
    <div className="rule-banner"><AlertTriangle size={18} /><div><strong>Rule-based review prompts</strong><span>High waste ≥20%, estimated cost ≥₹1,000, and a latest daily waste rate ≥1.5× earlier-day average. These are configurable frontend rules, not real-time backend alerts.</span></div></div>
    {loading && <Loading label="Checking recorded meals" />}
    {error && <ErrorState message={error} onRetry={refresh} />}
    {data && <Panel title={`${alerts.length} review ${alerts.length === 1 ? 'prompt' : 'prompts'}`} subtitle="Sorted by waste severity, then pattern and cost." className="alert-list-panel">
      {alerts.length ? <div className="alert-list">{alerts.map(({ id, kind, icon: Icon, title, detail, metric }) => <article key={id} className={`alert-item alert-${kind}`}>
        <span className="alert-icon"><Icon size={20} /></span><div className="alert-copy"><span className="alert-type">{kind === 'pattern' ? 'PATTERN' : kind.toUpperCase()}</span><h3>{title}</h3><p>{detail}</p></div><strong className="alert-metric">{metric}</strong>
      </article>)}</div> : <EmptyState title="No rule thresholds were triggered" message="There are no current records meeting the review rules above." />}
    </Panel>}
  </>
}