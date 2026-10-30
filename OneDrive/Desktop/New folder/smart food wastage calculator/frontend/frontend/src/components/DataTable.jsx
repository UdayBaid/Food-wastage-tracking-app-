import { EmptyState } from './States'
import { currency, number, shortDate } from '../utils/format'
import { Pencil, Trash2 } from 'lucide-react'

const columns = [
  { key: 'date', label: 'Date', render: (row) => shortDate(row.date) },
  { key: 'meal_category', label: 'Meal', render: (row) => <span className="meal-name">{row.meal_category || '—'}</span> },
  { key: 'menu_name', label: 'Menu', render: (row) => row.menu_name || '—' },
  { key: 'food_prepared_kg', label: 'Prepared', render: (row) => number(row.food_prepared_kg) },
  { key: 'food_consumed_kg', label: 'Consumed', render: (row) => number(row.food_consumed_kg) },
  { key: 'food_wasted_kg', label: 'Wasted', render: (row) => <span className="waste-number">{number(row.food_wasted_kg)}</span> },
  { key: 'waste_percentage', label: 'Waste %', render: (row) => `${number(row.waste_percentage ?? ((row.food_wasted_kg / row.food_prepared_kg) * 100))}%` },
  { key: 'estimated_waste_cost_inr', label: 'Est. cost', render: (row) => row.estimated_waste_cost_inr == null ? '—' : currency(row.estimated_waste_cost_inr) },
]

export default function DataTable({ rows = [], compact = false, onEdit, onDelete }) {
  if (!rows.length) return <EmptyState title="No food records yet" message="Add a log entry to start building your kitchen record." />
  const visibleColumns = compact ? columns.filter(({ key }) => !['menu_name', 'estimated_waste_cost_inr'].includes(key)) : columns
  const canEdit = Boolean(onEdit && !compact)
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead><tr>{visibleColumns.map(({ key, label }) => <th key={key}>{label}</th>)}{canEdit && <th>Actions</th>}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id ?? `${row.date}-${row.meal_category}-${index}`}>
          {visibleColumns.map(({ key, render }) => <td key={key}>{render(row)}</td>)}
          {canEdit && <td><div className="row-actions"><button className="icon-button" type="button" title="Edit food record" aria-label={`Edit ${row.meal_category} record on ${row.date}`} onClick={() => onEdit(row)}><Pencil size={15} /></button><button className="icon-button row-delete" type="button" title="Delete food record" aria-label={`Delete ${row.meal_category} record on ${row.date}`} onClick={() => onDelete(row)}><Trash2 size={15} /></button></div></td>}
        </tr>)}</tbody>
      </table>
    </div>
  )
}