import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowRight, CircleDollarSign, ClipboardPlus, Leaf, Scale, Utensils } from 'lucide-react'
import DataTable from '../components/DataTable'
import { ComparisonChart, MealDonut, TrendChart } from '../components/Charts'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import StatCard from '../components/StatCard'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useApiData, getData } from '../hooks/useApiData'
import { currency, number } from '../utils/format'

export default function Dashboard() {
  const [period, setPeriod] = useState('daily')
  const overview = useApiData(() => Promise.all([
    getData('/analytics/summary'),
    getData('/analytics/meal-wise'),
    getData('/records', { params: { limit: 6 } }),
  ]).then(([summary, meals, records]) => ({ summary, meals, records })), [])
  const trend = useApiData(() => getData('/analytics/trends', { params: { period } }), [period])

  useEffect(() => { document.title = 'Dashboard | FoodWise' }, [])

  return <>
    <PageHeader eyebrow="KITCHEN OVERVIEW" title="Good food, less waste." description="A clear view of what your kitchen prepares, serves and saves." action={<Link className="button button-primary" to="/log-entry"><ClipboardPlus size={17} /> Log a meal</Link>} />
    {overview.loading && <Loading label="Gathering your kitchen data" />}
    {overview.error && <ErrorState message={overview.error} onRetry={overview.refresh} />}
    {overview.data && <>
      <div className="stats-grid">
        <StatCard label="Food prepared" value={number(overview.data.summary.total_prepared_kg)} unit="kg" icon={Utensils} tone="mustard" note="Total recorded preparation" />
        <StatCard label="Food wasted" value={number(overview.data.summary.total_wasted_kg)} unit="kg" icon={Scale} tone="terracotta" note="Across all recorded meals" />
        <StatCard label="Overall waste" value={number(overview.data.summary.overall_waste_percentage, 1)} unit="%" icon={ArrowDownRight} tone="green" note="Waste as a share of prepared food" />
        <StatCard label="Estimated waste cost" value={currency(overview.data.summary.estimated_waste_cost_inr)} unit="" icon={CircleDollarSign} tone="ink" note="Estimated from recorded costs" />
      </div>

      <div className="dashboard-chart-grid">
        <Panel title="Waste over time" subtitle={`${period === 'daily' ? 'Daily' : 'Monthly'} recorded waste percentage`} action={<div className="segmented-control" aria-label="Trend period">{['daily', 'monthly'].map((value) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'segment-active' : ''} onClick={() => setPeriod(value)}>{value}</button>)}</div>} className="panel-span-2">
          {trend.loading && <Loading label="Loading trend" />}
          {trend.error && <ErrorState message={trend.error} onRetry={trend.refresh} />}
          {trend.data && (trend.data.trends.length ? <TrendChart data={trend.data.trends.slice(period === 'daily' ? -14 : -12)} /> : <EmptyState title="No trend data" />)}
        </Panel>
        <Panel title="Waste by meal" subtitle="Share of recorded waste">
          <MealDonut data={overview.data.meals.meal_categories} />
        </Panel>
        <Panel title="Prepared vs consumed vs wasted" subtitle="Daily quantity in kilograms" className="panel-span-2">
          {trend.data?.trends.length ? <ComparisonChart data={trend.data.trends.slice(-8)} /> : trend.loading ? <Loading label="Loading quantities" /> : <EmptyState title="No comparison data" />}
        </Panel>
        <Panel title="Kitchen insight" subtitle="From your recorded meal data" className="insight-panel">
          {overview.data.meals.highest_waste_meal ? <>
            <div className="insight-emblem"><Leaf size={21} /></div>
            <p className="insight-kicker">HIGHEST WASTE MEAL</p>
            <h3>{overview.data.meals.highest_waste_meal}</h3>
            <p className="insight-copy">This meal category has the most recorded food waste. Review its preparation patterns in Reports.</p>
            <Link to="/reports" className="inline-link">Explore reports <ArrowRight size={15} /></Link>
          </> : <EmptyState title="Not enough data yet" message="Meal insights appear after records are added." />}
        </Panel>
      </div>

      <Panel title="Recent food records" subtitle={`${overview.data.records.total} records in your kitchen log`} action={<Link className="inline-link" to="/reports">View reports <ArrowRight size={15} /></Link>} className="recent-panel">
        <DataTable rows={overview.data.records.records} compact />
      </Panel>
    </>}
  </>
}