import { useState } from 'react'
import { Check, RotateCcw, Save } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import { getApiError } from '../hooks/useApiData'
import api from '../services/api'

const localToday = () => {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const emptyForm = () => ({
  date: localToday(), meal_category: 'Breakfast', menu_name: '',
  student_turnout: '', residents_present: '', hostel_capacity: '', advance_bookings: '',
  food_prepared_kg: '', food_consumed_kg: '', food_wasted_kg: '', estimated_waste_cost_inr: '', notes: '',
})

function Field({ label, name, value, onChange, required, type = 'number', min, step = 'any', placeholder, help }) {
  return <label className="form-field">
    <span>{label}{required && <b className="required-mark"> *</b>}</span>
    <input name={name} type={type} value={value} onChange={onChange} required={required} min={min} step={step} placeholder={placeholder} />
    {help && <small>{help}</small>}
  </label>
}

export default function LogEntry() {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setSaved(false)
    setError('')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    const prepared = Number(form.food_prepared_kg)
    const consumed = Number(form.food_consumed_kg)
    const wasted = Number(form.food_wasted_kg)
    if (consumed + wasted > prepared) {
      setError('Consumed and wasted quantities cannot add up to more than the prepared quantity.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const selectedDate = new Date(`${form.date}T00:00:00`)
      await api.post('/records', {
        date: form.date,
        year: selectedDate.getFullYear(),
        month: selectedDate.getMonth() + 1,
        day_of_week: (selectedDate.getDay() + 6) % 7,
        day_name: selectedDate.toLocaleDateString('en-US', { weekday: 'long' }),
        meal_category: form.meal_category,
        menu_name: form.menu_name.trim() || null,
        hostel_capacity: Number(form.hostel_capacity),
        residents_present: Number(form.residents_present),
        student_turnout: Number(form.student_turnout),
        advance_bookings: Number(form.advance_bookings || 0),
        food_prepared_kg: prepared,
        food_consumed_kg: consumed,
        food_wasted_kg: wasted,
        waste_percentage: prepared ? (wasted / prepared) * 100 : 0,
        estimated_waste_cost_inr: form.estimated_waste_cost_inr === '' ? null : Number(form.estimated_waste_cost_inr),
      })
      setSaved(true)
      setForm(emptyForm())
    } catch (requestError) {
      setError(getApiError(requestError))
    } finally {
      setSaving(false)
    }
  }

  const reset = () => { setForm(emptyForm()); setError(''); setSaved(false) }

  return <>
    <PageHeader eyebrow="DAILY KITCHEN LOG" title="Record a meal" description="Capture what was prepared and what made it onto the plate." />
    <form onSubmit={handleSubmit} className="entry-layout">
      <div className="entry-main">
        <Panel title="Meal details" subtitle="Start with the meal and service date.">
          <div className="form-grid form-grid-two">
            <Field label="Service date" name="date" type="date" value={form.date} onChange={handleChange} required />
            <label className="form-field"><span>Meal category<b className="required-mark"> *</b></span><select name="meal_category" value={form.meal_category} onChange={handleChange} required><option>Breakfast</option><option>Lunch</option><option>Dinner</option></select></label>
            <Field label="Menu name" name="menu_name" type="text" value={form.menu_name} onChange={handleChange} placeholder="e.g. Vegetable pulao" />
          </div>
        </Panel>
        <Panel title="People & capacity" subtitle="Use the figures recorded for this service.">
          <div className="form-grid form-grid-three">
            <Field label="People served" name="student_turnout" value={form.student_turnout} onChange={handleChange} required min="0" step="1" placeholder="0" />
            <Field label="Residents present" name="residents_present" value={form.residents_present} onChange={handleChange} required min="0" step="1" placeholder="0" />
            <Field label="Hostel capacity" name="hostel_capacity" value={form.hostel_capacity} onChange={handleChange} required min="1" step="1" placeholder="0" />
            <Field label="Advance bookings" name="advance_bookings" value={form.advance_bookings} onChange={handleChange} min="0" step="1" placeholder="0" />
          </div>
        </Panel>
        <Panel title="Food quantities" subtitle="All quantities are measured in kilograms.">
          <div className="form-grid form-grid-three">
            <Field label="Food prepared" name="food_prepared_kg" value={form.food_prepared_kg} onChange={handleChange} required min="0" step="0.01" placeholder="0.00" />
            <Field label="Food consumed" name="food_consumed_kg" value={form.food_consumed_kg} onChange={handleChange} required min="0" step="0.01" placeholder="0.00" />
            <Field label="Food wasted" name="food_wasted_kg" value={form.food_wasted_kg} onChange={handleChange} required min="0" step="0.01" placeholder="0.00" />
            <Field label="Estimated waste cost" name="estimated_waste_cost_inr" value={form.estimated_waste_cost_inr} onChange={handleChange} min="0" step="0.01" placeholder="₹ optional" help="Enter only if you have a recorded cost." />
          </div>
        </Panel>
        <Panel title="Kitchen notes" subtitle="Notes are not stored by the current backend API.">
          <label className="form-field"><span>Notes</span><textarea name="notes" value={form.notes} onChange={handleChange} rows="3" placeholder="Notes are currently local to this form and are not submitted." disabled /></label>
        </Panel>
        {error && <div className="form-message form-message-error" role="alert">{error}</div>}
        {saved && <div className="form-message form-message-success" role="status"><Check size={18} /> Food record saved successfully.</div>}
        <div className="form-actions"><button className="button button-primary" type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving record…' : 'Save food record'}</button><button className="button button-light" type="button" onClick={reset}><RotateCcw size={16} />Reset form</button><span className="required-hint"><b className="required-mark">*</b> Required fields</span></div>
      </div>
      <aside className="entry-aside">
        <div className="aside-callout"><span className="aside-index">01</span><h3>One clear record at a time.</h3><p>Your entry is stored in the FoodWise SQLite record book and appears in reports after saving.</p></div>
        <div className="aside-callout aside-muted"><span className="aside-index">02</span><h3>Keep quantities consistent.</h3><p>Consumed plus wasted food must not add up to more than the prepared quantity.</p></div>
      </aside>
    </form>
  </>
}