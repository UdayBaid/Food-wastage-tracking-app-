import { useApiData, getData } from '../hooks/useApiData'
import { currency, number } from '../utils/format'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import StatCard from '../components/StatCard'
import { ComparisonChart, TrendChart } from '../components/Charts'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { CircleDollarSign, Leaf, Scale, Utensils } from 'lucide-react'

export default function Sustainability() {
  const { data, loading, error, refresh } = useApiData(() => Promise.all([
    getData('/analytics/summary'),
    getData('/analytics/trends', { params: { period: 'monthly' } }),
  ]).then(([summary, trends]) => ({ summary, trends })), [])

  return <>
    <PageHeader eyebrow="MEASURE WHAT MATTERS" title="Progress starts with a record." description="Track food, cost and kitchen patterns. Environmental impact is not estimated without supporting data." />
    {loading && <Loading label="Loading sustainability data" />}
    {error && <ErrorState message={error} onRetry={refresh} />}
    {data && <>
      <div className="stats-grid sustainability-stats">
        <StatCard label="Food waste recorded" value={number(data.summary.total_wasted_kg)} unit="kg" icon={Scale} tone="terracotta" note={`${data.summary.total_records.toLocaleString('en-IN')} qualifying records`} />
        <StatCard label="Estimated financial loss" value={currency(data.summary.estimated_waste_cost_inr)} unit="" icon={CircleDollarSign} tone="mustard" note="Sum of recorded waste costs" />
        <StatCard label="Food prepared" value={number(data.summary.total_prepared_kg)} unit="kg" icon={Utensils} tone="green" note="Across recorded meals" />
        <StatCard label="Waste share" value={number(data.summary.overall_waste_percentage)} unit="%" icon={Leaf} tone="ink" note="Recorded waste ÷ prepared quantity" />
      </div>
      <div className="sustainability-chart-grid">
        <Panel title="Monthly waste trend" subtitle="Waste percentage from database records"><TrendChart data={data.trends.trends} /></Panel>
        <Panel title="Kitchen quantities" subtitle="Monthly prepared, consumed and wasted kg"><ComparisonChart data={data.trends.trends} /></Panel>
      </div>
      {!data.trends.trends.length && <EmptyState title="Monthly trends will appear here" message="Add records with measured quantities to see change over time." />}
      <div className="impact-note"><Leaf size={19} /><p><strong>No carbon or environmental savings are shown.</strong> The current backend provides food quantities and estimated INR waste costs, but no validated emissions factor or impact calculation.</p></div>
    </>}
  </>
}