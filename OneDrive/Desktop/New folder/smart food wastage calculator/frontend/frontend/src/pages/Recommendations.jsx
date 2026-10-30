import { useState } from 'react'
import { ArrowRightLeft, BrainCircuit, LoaderCircle, Sparkles } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Panel from '../components/Panel'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useApiData, getApiError, getData } from '../hooks/useApiData'
import api from '../services/api'
import { currency, number, shortDate } from '../utils/format'

const predictionInitial = {
  meal_category: 'Breakfast', residents_present: '', student_turnout: '', hostel_capacity: '',
  day_of_week: String((new Date().getDay() + 6) % 7), month: String(new Date().getMonth() + 1), is_weekend: '0',
}
const optimizationInitial = {
  meal_category: 'Lunch', student_turnout: '', residents_present: '', hostel_capacity: '',
  advance_bookings: '', menu_popularity_score: '', expected_demand_kg: '', current_preparation_kg: '',
  day_of_week: String((new Date().getDay() + 6) % 7), month: String(new Date().getMonth() + 1), weekend_flag: '0',
  exam_flag: '0', vacation_flag: '0', festival_flag: '0', special_event_flag: '0', temperature_c: '25', rain_index: '0',
  waste_cost_per_kg: '20', shortage_cost_per_kg: '100',
}

function Input({ label, name, value, onChange, min = '0', max, step = '1', required = true }) {
  return <label className="form-field"><span>{label}{required && <b className="required-mark"> *</b>}</span><input name={name} type="number" min={min} max={max} step={step} value={value} onChange={onChange} required={required} /></label>
}

function MealSelect({ value, onChange }) {
  return <label className="form-field"><span>Meal category<b className="required-mark"> *</b></span><select name="meal_category" value={value} onChange={onChange}><option>Breakfast</option><option>Lunch</option><option>Dinner</option></select></label>
}

export default function Recommendations() {
  const [predictionForm, setPredictionForm] = useState(predictionInitial)
  const [optimizationForm, setOptimizationForm] = useState(optimizationInitial)
  const [prediction, setPrediction] = useState(null)
  const [optimization, setOptimization] = useState(null)
  const [predictionError, setPredictionError] = useState('')
  const [optimizationError, setOptimizationError] = useState('')
  const [busy, setBusy] = useState('')
  const logs = useApiData(() => Promise.all([
    getData('/predictions', { params: { limit: 5 } }),
    getData('/optimization-logs', { params: { limit: 5 } }),
  ]).then(([predictions, optimizations]) => ({ predictions, optimizations })), [])

  const updatePrediction = (event) => setPredictionForm((state) => ({ ...state, [event.target.name]: event.target.value }))
  const updateOptimization = (event) => setOptimizationForm((state) => ({ ...state, [event.target.name]: event.target.value }))

  const submitPrediction = async (event) => {
    event.preventDefault()
    setBusy('prediction')
    setPredictionError('')
    try {
      const body = { ...predictionForm }
      for (const key of ['residents_present', 'student_turnout', 'hostel_capacity', 'day_of_week', 'month', 'is_weekend']) body[key] = Number(body[key])
      const { data } = await api.post('/predict', body)
      setPrediction({ ...data, meal: body.meal_category })
      logs.refresh()
    } catch (error) { setPredictionError(getApiError(error)) } finally { setBusy('') }
  }

  const submitOptimization = async (event) => {
    event.preventDefault()
    setBusy('optimization')
    setOptimizationError('')
    try {
      const current = { ...optimizationForm }
      const body = { ...current }
      delete body.current_preparation_kg
      for (const key of ['student_turnout', 'residents_present', 'hostel_capacity', 'advance_bookings', 'day_of_week', 'month', 'weekend_flag', 'exam_flag', 'vacation_flag', 'festival_flag', 'special_event_flag']) body[key] = Number(body[key])
      for (const key of ['menu_popularity_score', 'expected_demand_kg', 'temperature_c', 'rain_index', 'waste_cost_per_kg', 'shortage_cost_per_kg']) body[key] = Number(body[key])
      const { data } = await api.post('/optimize', body)
      setOptimization({ ...data, meal: body.meal_category, currentPreparation: Number(current.current_preparation_kg) })
      logs.refresh()
    } catch (error) { setOptimizationError(getApiError(error)) } finally { setBusy('') }
  }

  const risk = prediction ? prediction.predicted_waste_kg < 5 ? 'Low' : prediction.predicted_waste_kg < 10 ? 'Moderate' : 'High' : ''

  return <>
    <PageHeader eyebrow="MODEL-ASSISTED PLANNING" title="Plan with a little more insight." description="Run the existing FoodWise models using your meal and attendance inputs." />
    <div className="recommendation-grid">
      <Panel title={<><BrainCircuit size={19} /> Food waste prediction</>} subtitle="Estimate waste for a meal using the trained baseline model.">
        <form className="model-form" onSubmit={submitPrediction}>
          <div className="form-grid form-grid-two">
            <MealSelect value={predictionForm.meal_category} onChange={updatePrediction} />
            <Input label="Residents present" name="residents_present" value={predictionForm.residents_present} onChange={updatePrediction} />
            <Input label="People expected to attend" name="student_turnout" value={predictionForm.student_turnout} onChange={updatePrediction} />
            <Input label="Hostel capacity" name="hostel_capacity" min="1" value={predictionForm.hostel_capacity} onChange={updatePrediction} />
            <Input label="Day of week (Mon = 0)" name="day_of_week" min="0" max="6" value={predictionForm.day_of_week} onChange={updatePrediction} />
            <Input label="Month" name="month" min="1" max="12" value={predictionForm.month} onChange={updatePrediction} />
            <label className="form-field"><span>Weekend</span><select name="is_weekend" value={predictionForm.is_weekend} onChange={updatePrediction}><option value="0">No</option><option value="1">Yes</option></select></label>
          </div>
          {predictionError && <div className="form-message form-message-error" role="alert">{predictionError}</div>}
          <button className="button button-primary" disabled={busy === 'prediction'}>{busy === 'prediction' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Predict food waste</button>
        </form>
        {prediction && <div className="result-block">
          <div className="result-heading"><span>MODEL ESTIMATE · {prediction.meal}</span><span className={`risk-pill risk-${risk.toLowerCase()}`}>{risk} guide</span></div>
          <div className="result-hero"><strong>{number(prediction.predicted_waste_kg, 2)}</strong><span>kg predicted waste</span></div>
          <p>Estimate from the existing ML model and submitted inputs. The risk guide is a frontend threshold (under 5 kg low, 5–10 kg moderate, 10 kg or more high), not a backend classification or a guarantee.</p>
        </div>}
      </Panel>

      <Panel title={<><ArrowRightLeft size={19} /> Preparation optimization</>} subtitle="Compare the model's recommended preparation with your current plan.">
        <form className="model-form" onSubmit={submitOptimization}>
          <div className="form-grid form-grid-two">
            <MealSelect value={optimizationForm.meal_category} onChange={updateOptimization} />
            <Input label="Expected demand (kg)" name="expected_demand_kg" min="0.01" step="0.01" value={optimizationForm.expected_demand_kg} onChange={updateOptimization} />
            <Input label="Current planned preparation (kg)" name="current_preparation_kg" min="0" step="0.1" value={optimizationForm.current_preparation_kg} onChange={updateOptimization} />
            <Input label="People expected to attend" name="student_turnout" value={optimizationForm.student_turnout} onChange={updateOptimization} />
            <Input label="Residents present" name="residents_present" value={optimizationForm.residents_present} onChange={updateOptimization} />
            <Input label="Hostel capacity" name="hostel_capacity" min="1" value={optimizationForm.hostel_capacity} onChange={updateOptimization} />
            <Input label="Advance bookings" name="advance_bookings" value={optimizationForm.advance_bookings} onChange={updateOptimization} />
            <Input label="Menu popularity (score)" name="menu_popularity_score" step="0.01" value={optimizationForm.menu_popularity_score} onChange={updateOptimization} />
            <Input label="Day of week (Mon = 0)" name="day_of_week" max="6" value={optimizationForm.day_of_week} onChange={updateOptimization} />
            <Input label="Month" name="month" min="1" max="12" value={optimizationForm.month} onChange={updateOptimization} />
            <Input label="Temperature (°C)" name="temperature_c" step="0.1" value={optimizationForm.temperature_c} onChange={updateOptimization} />
            <Input label="Rain index" name="rain_index" step="0.01" value={optimizationForm.rain_index} onChange={updateOptimization} />
            <Input label="Waste cost per kg (₹)" name="waste_cost_per_kg" step="0.1" value={optimizationForm.waste_cost_per_kg} onChange={updateOptimization} />
            <Input label="Shortage cost per kg (₹)" name="shortage_cost_per_kg" step="0.1" value={optimizationForm.shortage_cost_per_kg} onChange={updateOptimization} />
          </div>
          <div className="flag-row">{[['weekend_flag', 'Weekend'], ['exam_flag', 'Exam'], ['vacation_flag', 'Vacation'], ['festival_flag', 'Festival'], ['special_event_flag', 'Special event']].map(([name, label]) => <label key={name} className="check-field"><input type="checkbox" name={name} checked={optimizationForm[name] === '1'} onChange={(event) => setOptimizationForm((state) => ({ ...state, [name]: event.target.checked ? '1' : '0' }))} />{label}</label>)}</div>
          {optimizationError && <div className="form-message form-message-error" role="alert">{optimizationError}</div>}
          <button className="button button-primary" disabled={busy === 'optimization'}>{busy === 'optimization' ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />} Optimize preparation</button>
        </form>
        {optimization && <div className="result-block">
          <div className="result-heading"><span>MODEL ESTIMATE · {optimization.meal}</span><span className="risk-pill risk-neutral">Planning aid</span></div>
          <div className="result-metrics">
            <div><small>Recommended prep</small><strong>{number(optimization.recommended_preparation_kg)} kg</strong></div>
            <div><small>Expected waste</small><strong>{number(optimization.predicted_waste_kg)} kg</strong></div>
            <div><small>Expected shortage</small><strong>{number(optimization.estimated_shortage_kg)} kg</strong></div>
            <div><small>Estimated penalty</small><strong>{currency(optimization.estimated_penalty_cost)}</strong></div>
          </div>
          <div className="comparison-note">Current plan {number(optimization.currentPreparation)} kg <span>→</span> model recommendation {number(optimization.recommended_preparation_kg)} kg</div>
          <p>These are model estimates, not guaranteed real-world savings. The current plan is used only for this frontend comparison and is not sent to the backend.</p>
        </div>}
      </Panel>
    </div>

    <div className="log-history-grid">
      <Panel title="Recent predictions" subtitle="Saved model outputs">
        {logs.loading && <Loading label="Loading prediction history" />}
        {logs.error && <ErrorState message={logs.error} onRetry={logs.refresh} />}
        {logs.data && (logs.data.predictions.records.length ? <div className="mini-log-list">{logs.data.predictions.records.map((item) => <div key={item.id}><span className="log-marker marker-red" /><div><strong>{item.meal_category}</strong><small>{shortDate(item.created_at)}</small></div><b>{number(item.predicted_waste_kg)} kg</b></div>)}</div> : <EmptyState title="No predictions yet" />)}
      </Panel>
      <Panel title="Recent optimization runs" subtitle="Saved preparation recommendations">
        {logs.loading && <Loading label="Loading optimization history" />}
        {logs.error && <ErrorState message={logs.error} onRetry={logs.refresh} />}
        {logs.data && (logs.data.optimizations.records.length ? <div className="mini-log-list">{logs.data.optimizations.records.map((item) => <div key={item.id}><span className="log-marker marker-green" /><div><strong>{item.meal_category}</strong><small>{shortDate(item.created_at)}</small></div><b>{number(item.recommended_preparation_kg)} kg</b></div>)}</div> : <EmptyState title="No optimization runs yet" />)}
      </Panel>
    </div>
  </>
}