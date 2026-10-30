import { useMemo, useState } from 'react'
import { Download, Save, SlidersHorizontal, X } from 'lucide-react'
import DataTable from '../components/DataTable'
import { ComparisonChart, MealDonut, TrendChart } from '../components/Charts'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useApiData, getData } from '../hooks/useApiData'
import { getAllRecords } from '../services/api'
import { escapeCsv, startOfWeek } from '../utils/format'
import api from '../services/api'
import { getApiError } from '../hooks/useApiData'

const recordPeriod = (record, period) => {
  if (period === 'monthly') return String(record.date).slice(0, 7)
  if (period === 'weekly') return startOfWeek(record.date)
  return String(record.date)
}

function aggregateRecords(records, period) {
  const grouped = new Map()
  for (const record of records) {
    const key = recordPeriod(record, period)
    const totals = grouped.get(key) || { period: key, prepared_kg: 0, consumed_kg: 0, wasted_kg: 0, cost: 0 }
    totals.prepared_kg += Number(record.food_prepared_kg || 0)
    totals.consumed_kg += Number(record.food_consumed_kg || 0)
    totals.wasted_kg += Number(record.food_wasted_kg || 0)
    totals.cost += Number(record.estimated_waste_cost_inr || 0)
    grouped.set(key, totals)
  }
  return [...grouped.values()].sort((a, b) => a.period.localeCompare(b.period)).map((item) => ({
    ...item,
    waste_percentage: item.prepared_kg ? (item.wasted_kg / item.prepared_kg) * 100 : 0,
  }))
}

function aggregateMeals(records) {
  const grouped = new Map()
  for (const row of records) {
    const item = grouped.get(row.meal_category) || { meal_category: row.meal_category, prepared_kg: 0, consumed_kg: 0, wasted_kg: 0, records: 0 }
    item.prepared_kg += Number(row.food_prepared_kg || 0)
    item.consumed_kg += Number(row.food_consumed_kg || 0)
    item.wasted_kg += Number(row.food_wasted_kg || 0)
    item.records += 1
    grouped.set(row.meal_category, item)
  }
  return [...grouped.values()].sort((a, b) => b.wasted_kg - a.wasted_kg)
}

export default function Reports() {
  const [period, setPeriod] = useState('daily')
  const [meal, setMeal] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [editing, setEditing] = useState(null)
  const [mutationError, setMutationError] = useState('')
  const [saving, setSaving] = useState(false)
  const { data, loading, error, refresh } = useApiData(() => Promise.all([
    getData('/analytics/trends', { params: { period: period === 'weekly' ? 'daily' : period } }),
    getData('/analytics/meal-wise'),
    getAllRecords(),
  ]).then(([trends, meals, records]) => ({ trends, meals, records })), [period])

  const filteredRecords = useMemo(() => (data?.records.records || []).filter((row) => {
    const date = String(row.date || '')
    return (meal === 'all' || row.meal_category === meal)
      && (!fromDate || date >= fromDate)
      && (!toDate || date <= toDate)
  }), [data, meal, fromDate, toDate])
  const hasFilters = meal !== 'all' || Boolean(fromDate) || Boolean(toDate)
  const trendRows = useMemo(() => (
    period !== 'weekly' && !hasFilters
      ? data?.trends.trends || []
      : aggregateRecords(filteredRecords, period)
  ), [data, filteredRecords, period, hasFilters])
  const mealRows = useMemo(() => aggregateMeals(filteredRecords), [filteredRecords])

  const exportCsv = () => {
    const headers = ['Date', 'Meal', 'Menu', 'Prepared (kg)', 'Consumed (kg)', 'Wasted (kg)', 'Waste (%)', 'People served', 'Residents present', 'Hostel capacity', 'Estimated waste cost (INR)']
    const lines = filteredRecords.map((row) => [
      row.date, row.meal_category, row.menu_name, row.food_prepared_kg, row.food_consumed_kg,
      row.food_wasted_kg, row.waste_percentage, row.student_turnout, row.residents_present,
      row.hostel_capacity, row.estimated_waste_cost_inr,
    ].map(escapeCsv).join(','))
    const blob = new Blob([[headers.map(escapeCsv).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'foodwise-records.csv'
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const beginEdit = (record) => {
    setMutationError('')
    setEditing({
      ...record,
      date: String(record.date).slice(0, 10),
      food_prepared_kg: record.food_prepared_kg ?? '',
      food_consumed_kg: record.food_consumed_kg ?? '',
      food_wasted_kg: record.food_wasted_kg ?? '',
      student_turnout: record.student_turnout ?? '',
    })
  }

  const updateEditing = (event) => setEditing((current) => ({ ...current, [event.target.name]: event.target.value }))

  const saveEdit = async (event) => {
    event.preventDefault()
    const prepared = Number(editing.food_prepared_kg)
    const consumed = Number(editing.food_consumed_kg)
    const wasted = Number(editing.food_wasted_kg)
    if (consumed + wasted > prepared) {
      setMutationError('Consumed and wasted quantities cannot exceed prepared food.')
      return
    }
    setSaving(true)
    setMutationError('')
    try {
      await api.patch(`/records/${editing.id}`, {
        date: editing.date,
        meal_category: editing.meal_category,
        menu_name: editing.menu_name || null,
        food_prepared_kg: prepared,
        food_consumed_kg: consumed,
        food_wasted_kg: wasted,
        waste_percentage: prepared ? wasted / prepared * 100 : 0,
        student_turnout: editing.student_turnout === '' ? null : Number(editing.student_turnout),
      })
      setEditing(null)
      refresh()
    } catch (requestError) {
      setMutationError(getApiError(requestError))
    } finally {
      setSaving(false)
    }
  }

  const deleteRecord = async (record) => {
    if (!window.confirm(`Delete the ${record.meal_category} record for ${record.date}? This cannot be undone.`)) return
    setMutationError('')
    try {
      await api.delete(`/records/${record.id}`)
      refresh()
    } catch (requestError) {
      setMutationError(getApiError(requestError))
    }
  }

  return <>
    <PageHeader eyebrow="KITCHEN PERFORMANCE" title="Reports that reveal patterns." description="Explore recorded waste by time and meal, then export the underlying records." action={<button className="button button-primary" onClick={exportCsv} disabled={!filteredRecords.length}><Download size={16} /> Export CSV</button>} />
    <Panel title="Filter records" subtitle="Filters apply to the charts and table below." className="filters-panel">
      <div className="filters-row">
        <label className="form-field"><span>Time grouping</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label className="form-field"><span>Meal category</span><select value={meal} onChange={(event) => setMeal(event.target.value)}><option value="all">All meals</option>{(data?.meals.meal_categories || []).map((item) => <option key={item.meal_category}>{item.meal_category}</option>)}</select></label>
        <label className="form-field"><span>From date</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label className="form-field"><span>To date</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label>
        <span className="filter-count"><SlidersHorizontal size={15} /> {filteredRecords.length} matched records</span>
      </div>
      {period === 'weekly' && <p className="field-note">Weekly groups start on Monday and are calculated from the retrieved food records; the API currently provides daily and monthly aggregations.</p>}
    </Panel>
    {loading && <Loading label="Loading reports" />}
    {error && <ErrorState message={error} onRetry={refresh} />}
    {data && <>
      <div className="report-chart-grid">
        <Panel title="Waste percentage trend" subtitle={`${period[0].toUpperCase()}${period.slice(1)} grouping · based on filtered records`} className="panel-span-2">
          {trendRows.length ? <TrendChart data={trendRows} /> : <EmptyState title="No matching trend data" />}
        </Panel>
        <Panel title="Waste by meal type" subtitle="Waste quantity in kg"><MealDonut data={mealRows} /></Panel>
        <Panel title="Prepared vs consumed vs waste" subtitle="Recorded quantities in kg" className="panel-span-3">
          {trendRows.length ? <ComparisonChart data={trendRows} height={280} /> : <EmptyState title="No matching comparison data" />}
        </Panel>
      </div>
      {mutationError && <div className="form-message form-message-error" role="alert">{mutationError}</div>}
      {editing && <Panel title="Edit food record" subtitle={`Record #${editing.id}`} className="edit-record-panel">
        <form className="edit-record-form" onSubmit={saveEdit}>
          <label className="form-field"><span>Date *</span><input type="date" name="date" value={editing.date} onChange={updateEditing} required /></label>
          <label className="form-field"><span>Meal *</span><select name="meal_category" value={editing.meal_category} onChange={updateEditing}><option>Breakfast</option><option>Lunch</option><option>Dinner</option></select></label>
          <label className="form-field"><span>Menu</span><input name="menu_name" value={editing.menu_name || ''} onChange={updateEditing} /></label>
          <label className="form-field"><span>Prepared (kg) *</span><input type="number" min="0" step="0.01" name="food_prepared_kg" value={editing.food_prepared_kg} onChange={updateEditing} required /></label>
          <label className="form-field"><span>Consumed (kg) *</span><input type="number" min="0" step="0.01" name="food_consumed_kg" value={editing.food_consumed_kg} onChange={updateEditing} required /></label>
          <label className="form-field"><span>Wasted (kg) *</span><input type="number" min="0" step="0.01" name="food_wasted_kg" value={editing.food_wasted_kg} onChange={updateEditing} required /></label>
          <label className="form-field"><span>People served</span><input type="number" min="0" step="1" name="student_turnout" value={editing.student_turnout} onChange={updateEditing} /></label>
          <div className="edit-record-actions"><button className="button button-primary" disabled={saving}><Save size={15} />{saving ? 'Saving…' : 'Save changes'}</button><button type="button" className="button button-light" onClick={() => setEditing(null)}><X size={15} />Cancel</button></div>
        </form>
      </Panel>}
      <Panel title="Food records" subtitle={`Showing ${filteredRecords.length} filtered records`} className="records-table-panel"><DataTable rows={filteredRecords} onEdit={beginEdit} onDelete={deleteRecord} /></Panel>
    </>}
  </>
}