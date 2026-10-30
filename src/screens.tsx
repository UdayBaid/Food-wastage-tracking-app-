import { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { ArrowDownToLine, ArrowRight, Camera, Check, ChevronRight, CircleAlert, CloudUpload, Database, Leaf, RotateCcw, Save, Settings2, ShieldCheck, Sparkles, Trash2 } from 'lucide-react-native';
import { getAnalytics, deleteRecord, exportBackupData, getPendingSyncCount, listOptimizations, listPredictions, listRecords, resolveRecordConflict, restoreBackupData, saveOptimization, savePrediction, saveRecord } from './db/repository';
import type { FoodRecord, FoodRecordInput, MealCategory, OptimizationHistory, PredictionHistory } from './domain/types';
import { useFoodWiseDatabase } from './db/provider';
import { useAppServices } from './services/AppContext';
import { api, explainApiError } from './services/api';
import { optimizePreparation, predictWaste } from './services/localModels';
import type { OptimizationResult } from './domain/types';
import { ActionButton, EmptyState, LoadingState, Panel, Screen, Segment, StatTile, StatusBanner, TextField } from './components/ui';
import { ComparisonChart, MealBars, TrendChart } from './components/Charts';
import { colors, spacing } from './theme';

const mealOptions: MealCategory[] = ['Breakfast', 'Lunch', 'Dinner'];
const numberFormat = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
const currencyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const today = () => new Date().toISOString().slice(0, 10);
const asNumber = (value: string, fallback = 0) => Number.isFinite(Number(value)) && value !== '' ? Number(value) : fallback;
const asOptionalNumber = (value: string) => value === '' ? null : asNumber(value);
const shortDate = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export function DashboardScreen() {
  const { database } = useFoodWiseDatabase();
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAnalytics>> | null>(null);
  const [records, setRecords] = useState<FoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!database) return;
    try {
      const [nextAnalytics, nextRecords] = await Promise.all([getAnalytics(database), listRecords(database)]);
      setAnalytics(nextAnalytics);
      setRecords(nextRecords.slice(0, 5));
    } finally { setLoading(false); }
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  if (loading) return <Screen title="Your kitchen" eyebrow="FOODWISE"><LoadingState /></Screen>;
  return <Screen title="Good food, less waste." eyebrow="KITCHEN OVERVIEW" subtitle="A local picture of what your kitchen prepares and serves." right={<View style={styles.localMark}><Leaf size={17} color={colors.green} /><Text style={styles.localMarkText}>ON DEVICE</Text></View>}>
    <View style={styles.statsGrid}>
      <StatTile label="Food prepared" value={numberFormat.format(analytics?.total_prepared_kg ?? 0)} unit="kg" tone="mustard" />
      <StatTile label="Food wasted" value={numberFormat.format(analytics?.total_wasted_kg ?? 0)} unit="kg" />
      <StatTile label="Waste share" value={numberFormat.format(analytics?.overall_waste_percentage ?? 0)} unit="%" tone="green" />
      <StatTile label="Recorded cost" value={currencyFormat.format(analytics?.estimated_waste_cost_inr ?? 0)} tone="ink" />
    </View>
    <Panel title="Waste by meal" subtitle="From this device's food records">
      {analytics?.meal_categories.length ? <MealBars data={analytics.meal_categories} /> : <EmptyState title="No meal records yet" detail="Add a meal to begin your local history." />}
    </Panel>
    <Panel title="Recent records" action={<Text style={styles.panelAction}>SQLite · local</Text>}>
      {records.length ? records.map((record) => <RecordRow key={record.id} record={record} />) : <EmptyState title="No food records yet" detail="Your entries stay on this device." />}
    </Panel>
    <Panel title="Daily waste trend"><TrendChart data={analytics?.trends ?? []} /></Panel>
    <Panel title="Prepared · consumed · wasted"><ComparisonChart data={analytics?.trends ?? []} /></Panel>
  </Screen>;
}

const emptyMealForm = () => ({ date: today(), meal_category: 'Breakfast' as MealCategory, menu_name: '', student_turnout: '', residents_present: '', hostel_capacity: '', advance_bookings: '', food_prepared_kg: '', food_consumed_kg: '', food_wasted_kg: '', estimated_waste_cost_inr: '' });
type MealForm = ReturnType<typeof emptyMealForm>;

export function RecordsScreen() {
  const { database } = useFoodWiseDatabase();
  const [rows, setRows] = useState<FoodRecord[]>([]);
  const [form, setForm] = useState<MealForm>(emptyMealForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);
  const refresh = useCallback(async () => {
    if (!database) return;
    const [nextRows, pendingCount] = await Promise.all([listRecords(database), getPendingSyncCount(database)]);
    setRows(nextRows);
    setPending(pendingCount);
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const patch = <K extends keyof MealForm>(key: K, value: MealForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const openNew = () => { setEditingId(null); setForm(emptyMealForm()); setError(''); setFormOpen(true); };
  const edit = (record: FoodRecord) => {
    setEditingId(record.id);
    setForm({ date: record.date.slice(0, 10), meal_category: record.meal_category, menu_name: record.menu_name ?? '', student_turnout: String(record.student_turnout ?? ''), residents_present: String(record.residents_present ?? ''), hostel_capacity: String(record.hostel_capacity ?? ''), advance_bookings: String(record.advance_bookings ?? ''), food_prepared_kg: String(record.food_prepared_kg ?? ''), food_consumed_kg: String(record.food_consumed_kg ?? ''), food_wasted_kg: String(record.food_wasted_kg ?? ''), estimated_waste_cost_inr: String(record.estimated_waste_cost_inr ?? '') });
    setError('');
    setFormOpen(true);
  };
  const save = async () => {
    if (!database) return;
    if (!form.date || !form.hostel_capacity || !form.food_prepared_kg || !form.food_consumed_kg || !form.food_wasted_kg) {
      setError('Enter the date, capacity, and all three food quantities.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const prepared = asNumber(form.food_prepared_kg);
      const consumed = asNumber(form.food_consumed_kg);
      const wasted = asNumber(form.food_wasted_kg);
      const payload: FoodRecordInput & { date: string; meal_category: MealCategory } = {
        date: form.date,
        meal_category: form.meal_category,
        menu_name: form.menu_name.trim() || null,
        student_turnout: asOptionalNumber(form.student_turnout),
        residents_present: asOptionalNumber(form.residents_present),
        hostel_capacity: asNumber(form.hostel_capacity),
        advance_bookings: asOptionalNumber(form.advance_bookings),
        food_prepared_kg: prepared,
        food_consumed_kg: consumed,
        food_wasted_kg: wasted,
        waste_percentage: prepared ? wasted / prepared * 100 : 0,
        estimated_waste_cost_inr: asOptionalNumber(form.estimated_waste_cost_inr),
      };
      await saveRecord(database, payload, editingId ?? undefined);
      setFormOpen(false);
      setForm(emptyMealForm());
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Food record could not be saved.'); }
    finally { setSaving(false); }
  };
  const remove = (record: FoodRecord) => Alert.alert('Delete this record?', `${record.meal_category} · ${shortDate(record.date)}`, [
    { text: 'Keep record', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => { void deleteRecord(database!, record.id).then(refresh).catch((cause) => setError(explainApiError(cause))); } },
  ]);

  return <Screen title="Food records" eyebrow="LOCAL FOOD LOG" subtitle={`${rows.length} records on this device · ${pending} queued for sync`} right={<ActionButton label="Add meal" onPress={openNew} compact />}>
    {formOpen ? <Panel title={editingId ? 'Edit meal' : 'New meal'} subtitle="Saved on this device first.">
      <TextField label="Service date" value={form.date} onChangeText={(value) => patch('date', value)} placeholder="YYYY-MM-DD" />
      <Segment label="Meal" value={form.meal_category} options={mealOptions} onChange={(value) => patch('meal_category', value)} />
      <TextField label="Menu" value={form.menu_name} onChangeText={(value) => patch('menu_name', value)} placeholder="e.g. Vegetable pulao" />
      <View style={styles.formGrid}>
        <TextField label="People served" value={form.student_turnout} onChangeText={(value) => patch('student_turnout', value)} keyboardType="numeric" placeholder="0" />
        <TextField label="Residents present" value={form.residents_present} onChangeText={(value) => patch('residents_present', value)} keyboardType="numeric" placeholder="0" />
        <TextField label="Hostel capacity" value={form.hostel_capacity} onChangeText={(value) => patch('hostel_capacity', value)} keyboardType="numeric" placeholder="520" />
        <TextField label="Advance bookings" value={form.advance_bookings} onChangeText={(value) => patch('advance_bookings', value)} keyboardType="numeric" placeholder="0" />
      </View>
      <View style={styles.formGrid}>
        <TextField label="Prepared (kg)" value={form.food_prepared_kg} onChangeText={(value) => patch('food_prepared_kg', value)} keyboardType="decimal-pad" placeholder="0.00" />
        <TextField label="Consumed (kg)" value={form.food_consumed_kg} onChangeText={(value) => patch('food_consumed_kg', value)} keyboardType="decimal-pad" placeholder="0.00" />
        <TextField label="Wasted (kg)" value={form.food_wasted_kg} onChangeText={(value) => patch('food_wasted_kg', value)} keyboardType="decimal-pad" placeholder="0.00" />
        <TextField label="Waste cost (INR)" value={form.estimated_waste_cost_inr} onChangeText={(value) => patch('estimated_waste_cost_inr', value)} keyboardType="decimal-pad" placeholder="Optional" />
      </View>
      {error ? <StatusBanner title="Record not saved" detail={error} tone="error" /> : null}
      <View style={styles.buttonRow}><ActionButton label={editingId ? 'Save changes' : 'Save meal'} onPress={() => void save()} loading={saving} /><ActionButton label="Cancel" kind="light" onPress={() => setFormOpen(false)} /></View>
    </Panel> : null}
    {rows.length ? rows.map((record) => <Panel key={record.id}>
      <View style={styles.recordHeader}>
        <View style={styles.headerCopy}><Text style={styles.recordMeal}>{record.meal_category}</Text><Text style={styles.subtitle}>{shortDate(record.date)}{record.menu_name ? ` · ${record.menu_name}` : ''}</Text></View>
        <Text style={styles.recordWaste}>{numberFormat.format(record.food_wasted_kg ?? 0)} kg waste</Text>
      </View>
      <Text style={styles.recordLine}>Prepared {numberFormat.format(record.food_prepared_kg ?? 0)} kg · Consumed {numberFormat.format(record.food_consumed_kg ?? 0)} kg</Text>
      <View style={styles.buttonRow}><ActionButton label="Edit" kind="light" compact onPress={() => edit(record)} /><ActionButton label="Delete" kind="danger" compact onPress={() => remove(record)} /></View>
      {record.sync_state === 'conflict' ? <>
        <StatusBanner title="Server copy changed" detail="Choose which version to keep before synchronization resumes." tone="warning" />
        <View style={styles.buttonRow}>
          <ActionButton label="Keep this device" kind="light" compact onPress={() => Alert.alert('Keep this version?', 'The local record will replace the server copy.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Keep local', onPress: () => { void resolveRecordConflict(database!, record.id, 'local').then(refresh).catch((cause) => setError(explainApiError(cause))); } }])} />
          <ActionButton label="Use server copy" kind="light" compact onPress={() => Alert.alert('Use server version?', 'This replaces the local record with the server copy.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Use server', style: 'destructive', onPress: () => { void resolveRecordConflict(database!, record.id, 'server').then(refresh).catch((cause) => setError(explainApiError(cause))); } }])} />
        </View>
      </> : <Text style={styles.syncText}>{record.sync_state === 'synced' ? 'Synced' : 'On device · sync pending'}</Text>}
    </Panel>) : <Panel><EmptyState title="No meals recorded yet" detail="Add your first meal. It will remain on this device when offline." /></Panel>}
  </Screen>;
}

export function ReportsScreen() {
  const { database } = useFoodWiseDatabase();
  const { backend } = useAppServices();
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAnalytics>> | null>(null);
  const [sharedAnalytics, setSharedAnalytics] = useState<{ total_records: number; total_wasted_kg: number; overall_waste_percentage: number } | null>(null);
  const [rows, setRows] = useState<FoodRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!database) return;
    const [nextAnalytics, nextRows] = await Promise.all([getAnalytics(database), listRecords(database)]);
    setAnalytics(nextAnalytics);
    setRows(nextRows);
    setLoading(false);
  }, [database]);
  useFocusEffect(useCallback(() => {
    void refresh();
    if (backend === 'ready') void api.get('/analytics/summary').then(({ data }) => setSharedAnalytics(data)).catch(() => setSharedAnalytics(null));
    else setSharedAnalytics(null);
  }, [backend, refresh]));

  const exportCsv = async () => {
    const header = ['Date', 'Meal', 'Menu', 'Prepared (kg)', 'Consumed (kg)', 'Wasted (kg)', 'Waste (%)', 'People served', 'Residents present', 'Capacity', 'Estimated cost (INR)'];
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [header.map(quote).join(','), ...rows.map((row) => [row.date, row.meal_category, row.menu_name, row.food_prepared_kg, row.food_consumed_kg, row.food_wasted_kg, row.waste_percentage, row.student_turnout, row.residents_present, row.hostel_capacity, row.estimated_waste_cost_inr].map(quote).join(','))].join('\r\n');
    const uri = `${FileSystem.documentDirectory}foodwise-records-${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(uri, csv);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'Export FoodWise records' });
    else Alert.alert('CSV ready', uri);
  };

  if (loading || !analytics) return <Screen title="Reports" eyebrow="LOCAL ANALYTICS"><LoadingState /></Screen>;
  return <Screen title="Reports" eyebrow="LOCAL ANALYTICS" subtitle="Calculated from this device's SQLite records." right={<ActionButton label="Export CSV" onPress={() => void exportCsv()} compact />}>
    <View style={styles.statsGrid}>
      <StatTile label="Qualifying meals" value={numberFormat.format(analytics.total_records)} tone="ink" />
      <StatTile label="Prepared" value={numberFormat.format(analytics.total_prepared_kg)} unit="kg" tone="mustard" />
      <StatTile label="Consumed" value={numberFormat.format(analytics.total_consumed_kg)} unit="kg" tone="green" />
      <StatTile label="Waste cost" value={currencyFormat.format(analytics.estimated_waste_cost_inr)} />
    </View>
    <Panel title="Waste over time" subtitle="Daily recorded waste percentage"><TrendChart data={analytics.trends} /></Panel>
    <Panel title="Prepared · consumed · wasted"><ComparisonChart data={analytics.trends} /></Panel>
    <Panel title="Waste by meal"><MealBars data={analytics.meal_categories} /></Panel>
    {sharedAnalytics ? <Panel title="Shared kitchen overview" subtitle="Optional FastAPI data from the configured local server.">
      <Text style={styles.recordLine}>{numberFormat.format(sharedAnalytics.total_records)} records · {numberFormat.format(sharedAnalytics.total_wasted_kg)} kg waste · {numberFormat.format(sharedAnalytics.overall_waste_percentage)}%</Text>
    </Panel> : null}
    {analytics.trends.length === 0 ? <EmptyState title="No qualifying quantities" detail="Records need prepared, consumed, and wasted measurements for analytics." /> : null}
  </Screen>;
}

const predictionInitial = { meal_category: 'Breakfast' as MealCategory, residents_present: '180', student_turnout: '135', hostel_capacity: '520', day_of_week: String((new Date().getDay() + 6) % 7), month: String(new Date().getMonth() + 1), is_weekend: 0 };
const optimizationInitial = { meal_category: 'Lunch' as MealCategory, student_turnout: '140', residents_present: '180', hostel_capacity: '520', advance_bookings: '145', menu_popularity_score: '0.8', expected_demand_kg: '75', day_of_week: String((new Date().getDay() + 6) % 7), month: String(new Date().getMonth() + 1), weekend_flag: 0, exam_flag: 0, vacation_flag: 0, festival_flag: 0, special_event_flag: 0, temperature_c: '25', rain_index: '0', waste_cost_per_kg: '20', shortage_cost_per_kg: '100' };

export function RecommendationsScreen() {
  const { database } = useFoodWiseDatabase();
  const { models, modelError } = useAppServices();
  const [predictionForm, setPredictionForm] = useState(predictionInitial);
  const [optimizationForm, setOptimizationForm] = useState(optimizationInitial);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [optimization, setOptimization] = useState<OptimizationResult | null>(null);
  const [predictionHistory, setPredictionHistory] = useState<PredictionHistory[]>([]);
  const [optimizationHistory, setOptimizationHistory] = useState<OptimizationHistory[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!database) return;
    const [predictions, optimizations] = await Promise.all([listPredictions(database), listOptimizations(database)]);
    setPredictionHistory(predictions);
    setOptimizationHistory(optimizations);
  }, [database]);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  const patchPrediction = <K extends keyof typeof predictionInitial>(key: K, value: (typeof predictionInitial)[K]) => setPredictionForm((state) => ({ ...state, [key]: value }));
  const patchOptimization = <K extends keyof typeof optimizationInitial>(key: K, value: (typeof optimizationInitial)[K]) => setOptimizationForm((state) => ({ ...state, [key]: value }));

  const runPrediction = async () => {
    if (!database) return;
    setBusy('prediction'); setError('');
    try {
      const input = { ...predictionForm, residents_present: asNumber(predictionForm.residents_present), student_turnout: asNumber(predictionForm.student_turnout), hostel_capacity: asNumber(predictionForm.hostel_capacity), day_of_week: asNumber(predictionForm.day_of_week), month: asNumber(predictionForm.month), is_weekend: predictionForm.is_weekend };
      const value = await predictWaste(input);
      setPrediction(value);
      await savePrediction(database, input.meal_category, value, input);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Local prediction failed.'); }
    finally { setBusy(''); }
  };

  const runOptimization = async () => {
    if (!database) return;
    setBusy('optimization'); setError('');
    try {
      const input = {
        ...optimizationForm,
        student_turnout: asNumber(optimizationForm.student_turnout), residents_present: asNumber(optimizationForm.residents_present),
        hostel_capacity: asNumber(optimizationForm.hostel_capacity), advance_bookings: asNumber(optimizationForm.advance_bookings),
        menu_popularity_score: asNumber(optimizationForm.menu_popularity_score), expected_demand_kg: asNumber(optimizationForm.expected_demand_kg),
        day_of_week: asNumber(optimizationForm.day_of_week), month: asNumber(optimizationForm.month), weekend_flag: optimizationForm.weekend_flag,
        exam_flag: optimizationForm.exam_flag, vacation_flag: optimizationForm.vacation_flag, festival_flag: optimizationForm.festival_flag,
        special_event_flag: optimizationForm.special_event_flag, temperature_c: asNumber(optimizationForm.temperature_c, 25),
        rain_index: asNumber(optimizationForm.rain_index), waste_cost_per_kg: asNumber(optimizationForm.waste_cost_per_kg, 20),
        shortage_cost_per_kg: asNumber(optimizationForm.shortage_cost_per_kg, 100),
      };
      const result = await optimizePreparation(input);
      setOptimization(result);
      await saveOptimization(database, input, result);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Local optimization failed.'); }
    finally { setBusy(''); }
  };

  return <Screen title="AI recommendations" eyebrow="LOCAL MODEL PLANNING" subtitle="FoodWise models run on this device; no API call is needed.">
    {models === 'failed' ? <StatusBanner title="Local models unavailable" detail={modelError} tone="error" /> : models === 'loading' ? <StatusBanner title="Loading local model files" detail="Prediction and optimization become available when both sessions are ready." tone="warning" /> : null}
    {error ? <StatusBanner title="Local inference failed" detail={error} tone="error" /> : null}
    <Panel title="Food waste prediction" subtitle="Existing baseline model · 7 features">
      <Segment label="Meal" value={predictionForm.meal_category} options={mealOptions} onChange={(value) => patchPrediction('meal_category', value)} />
      <View style={styles.formGrid}>
        <TextField label="Residents present" value={predictionForm.residents_present} onChangeText={(value) => patchPrediction('residents_present', value)} keyboardType="numeric" />
        <TextField label="People expected" value={predictionForm.student_turnout} onChangeText={(value) => patchPrediction('student_turnout', value)} keyboardType="numeric" />
        <TextField label="Hostel capacity" value={predictionForm.hostel_capacity} onChangeText={(value) => patchPrediction('hostel_capacity', value)} keyboardType="numeric" />
        <TextField label="Day (Mon = 0)" value={predictionForm.day_of_week} onChangeText={(value) => patchPrediction('day_of_week', value)} keyboardType="numeric" />
        <TextField label="Month" value={predictionForm.month} onChangeText={(value) => patchPrediction('month', value)} keyboardType="numeric" />
      </View>
      <Segment label="Weekend" value={predictionForm.is_weekend ? 'Yes' : 'No'} options={['No', 'Yes'] as const} onChange={(value) => patchPrediction('is_weekend', value === 'Yes' ? 1 : 0)} />
      <ActionButton label="Predict food waste" onPress={() => void runPrediction()} loading={busy === 'prediction'} disabled={models !== 'ready'} />
      {prediction != null ? <StatusBanner title={`${numberFormat.format(prediction)} kg predicted waste`} detail="Estimate from the existing local baseline model." tone="good" /> : null}
    </Panel>
    <Panel title="Preparation optimization" subtitle="Existing 16-feature forest and current cost objective">
      <Segment label="Meal" value={optimizationForm.meal_category} options={mealOptions} onChange={(value) => patchOptimization('meal_category', value)} />
      <View style={styles.formGrid}>
        <TextField label="Expected demand (kg)" value={optimizationForm.expected_demand_kg} onChangeText={(value) => patchOptimization('expected_demand_kg', value)} keyboardType="decimal-pad" />
        <TextField label="People expected" value={optimizationForm.student_turnout} onChangeText={(value) => patchOptimization('student_turnout', value)} keyboardType="numeric" />
        <TextField label="Residents present" value={optimizationForm.residents_present} onChangeText={(value) => patchOptimization('residents_present', value)} keyboardType="numeric" />
        <TextField label="Capacity" value={optimizationForm.hostel_capacity} onChangeText={(value) => patchOptimization('hostel_capacity', value)} keyboardType="numeric" />
        <TextField label="Advance bookings" value={optimizationForm.advance_bookings} onChangeText={(value) => patchOptimization('advance_bookings', value)} keyboardType="numeric" />
        <TextField label="Menu popularity" value={optimizationForm.menu_popularity_score} onChangeText={(value) => patchOptimization('menu_popularity_score', value)} keyboardType="decimal-pad" />
        <TextField label="Waste cost / kg" value={optimizationForm.waste_cost_per_kg} onChangeText={(value) => patchOptimization('waste_cost_per_kg', value)} keyboardType="decimal-pad" />
        <TextField label="Shortage cost / kg" value={optimizationForm.shortage_cost_per_kg} onChangeText={(value) => patchOptimization('shortage_cost_per_kg', value)} keyboardType="decimal-pad" />
      </View>
      <FlagToggle label="Weekend" value={optimizationForm.weekend_flag} onChange={(value) => patchOptimization('weekend_flag', value)} />
      <FlagToggle label="Exam period" value={optimizationForm.exam_flag} onChange={(value) => patchOptimization('exam_flag', value)} />
      <FlagToggle label="Vacation" value={optimizationForm.vacation_flag} onChange={(value) => patchOptimization('vacation_flag', value)} />
      <FlagToggle label="Festival" value={optimizationForm.festival_flag} onChange={(value) => patchOptimization('festival_flag', value)} />
      <FlagToggle label="Special event" value={optimizationForm.special_event_flag} onChange={(value) => patchOptimization('special_event_flag', value)} />
      <ActionButton label="Optimize preparation" onPress={() => void runOptimization()} loading={busy === 'optimization'} disabled={models !== 'ready'} />
      {optimization ? <View style={styles.resultGrid}>
        <Result label="Recommended prep" value={`${numberFormat.format(optimization.recommended_preparation_kg)} kg`} />
        <Result label="Expected waste" value={`${numberFormat.format(optimization.predicted_waste_kg)} kg`} />
        <Result label="Shortage" value={`${numberFormat.format(optimization.estimated_shortage_kg)} kg`} />
        <Result label="Penalty estimate" value={currencyFormat.format(optimization.estimated_penalty_cost)} />
      </View> : null}
    </Panel>
    {predictionHistory.length ? <Panel title="Recent predictions">{predictionHistory.slice(0, 5).map((item) => <Text style={styles.historyRow} key={item.id}>{item.meal_category} · {shortDate(item.created_at)} · {numberFormat.format(item.predicted_waste_kg)} kg</Text>)}</Panel> : null}
    {optimizationHistory.length ? <Panel title="Recent plans">{optimizationHistory.slice(0, 5).map((item) => <Text style={styles.historyRow} key={item.id}>{item.meal_category} · {shortDate(item.created_at)} · prep {numberFormat.format(item.recommended_preparation_kg)} kg</Text>)}</Panel> : null}
  </Screen>;
}

function FlagToggle({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <Pressable onPress={() => onChange(value ? 0 : 1)} style={styles.flagRow}><Text style={styles.recordLine}>{label}</Text><Text style={[styles.flagValue, value === 1 && styles.flagOn]}>{value ? 'Yes' : 'No'}</Text></Pressable>;
}
function Result({ label, value }: { label: string; value: string }) { return <View style={styles.resultItem}><Text style={styles.resultLabel}>{label}</Text><Text style={styles.resultValue}>{value}</Text></View>; }

export function AlertsScreen() {
  const { database } = useFoodWiseDatabase();
  const [rows, setRows] = useState<FoodRecord[]>([]);
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAnalytics>> | null>(null);
  useFocusEffect(useCallback(() => {
    if (database) void Promise.all([listRecords(database), getAnalytics(database)]).then(([nextRows, nextAnalytics]) => {
      setRows(nextRows);
      setAnalytics(nextAnalytics);
    });
  }, [database]));
  const alerts = useMemo(() => {
    const items: Array<{ id: string; title: string; detail: string; metric: string; severity: number }> = [];
    for (const record of rows) {
      const percentage = Number(record.waste_percentage ?? ((record.food_prepared_kg ?? 0) ? (record.food_wasted_kg ?? 0) / (record.food_prepared_kg ?? 1) * 100 : 0));
      if (percentage >= 20) items.push({ id: `waste-${record.id}`, title: 'High food waste recorded', detail: `${record.meal_category} · ${shortDate(record.date)}`, metric: `${numberFormat.format(record.food_wasted_kg ?? 0)} kg · ${numberFormat.format(percentage)}%`, severity: 0 });
      if (Number(record.estimated_waste_cost_inr ?? 0) >= 1000) items.push({ id: `cost-${record.id}`, title: 'High estimated waste cost', detail: `${record.meal_category} · ${shortDate(record.date)}`, metric: currencyFormat.format(record.estimated_waste_cost_inr ?? 0), severity: 2 });
    }
    const days = analytics?.trends ?? [];
    if (days.length >= 5) {
      const latest = days[days.length - 1];
      const earlier = days.slice(0, -1);
      const baseline = earlier.reduce((sum, item) => sum + item.waste_percentage, 0) / earlier.length;
      if (baseline > 0 && latest.waste_percentage >= baseline * 1.5) items.push({ id: 'pattern-latest', title: 'Unusual waste pattern to review', detail: `Latest daily waste is at least 1.5× the earlier-day average.`, metric: `${numberFormat.format(latest.waste_percentage)}% vs ${numberFormat.format(baseline)}%`, severity: 1 });
    }
    return items.sort((a, b) => a.severity - b.severity);
  }, [rows, analytics]);
  return <Screen title="Review prompts" eyebrow="LOCAL ALERTS" subtitle="Rule-based reminders calculated from records on this device.">
    <StatusBanner title="Not a real-time alert service" detail="FoodWise reviews only recorded meals; it does not monitor a kitchen or sensor feed." tone="warning" />
    {alerts.length ? alerts.map((item) => <Panel key={item.id} title={item.title} subtitle={item.detail}><Text style={styles.recordWaste}>{item.metric}</Text></Panel>) : <EmptyState title="No review prompts" detail="No local meal record reached the waste, cost, or trend review thresholds." />}
  </Screen>;
}

export function SustainabilityScreen() {
  const { database } = useFoodWiseDatabase();
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof getAnalytics>> | null>(null);
  useFocusEffect(useCallback(() => { if (database) void getAnalytics(database).then(setAnalytics); }, [database]));
  return <Screen title="Progress starts with a record." eyebrow="SUSTAINABILITY" subtitle="Local quantities and recorded costs, without unsupported impact estimates.">
    <View style={styles.statsGrid}>
      <StatTile label="Food wasted" value={numberFormat.format(analytics?.total_wasted_kg ?? 0)} unit="kg" />
      <StatTile label="Food prepared" value={numberFormat.format(analytics?.total_prepared_kg ?? 0)} unit="kg" tone="mustard" />
      <StatTile label="Waste share" value={numberFormat.format(analytics?.overall_waste_percentage ?? 0)} unit="%" tone="green" />
      <StatTile label="Recorded cost" value={currencyFormat.format(analytics?.estimated_waste_cost_inr ?? 0)} tone="ink" />
    </View>
    <Panel title="Monthly waste trend"><TrendChart data={groupMonthly(analytics?.trends ?? [])} /></Panel>
    <StatusBanner title="No carbon estimate shown" detail="The existing system has no validated emissions factor; no environmental savings are fabricated." />
  </Screen>;
}

function groupMonthly(trends: Awaited<ReturnType<typeof getAnalytics>>['trends']) {
  const groups = new Map<string, { period: string; prepared_kg: number; consumed_kg: number; wasted_kg: number; estimated_cost_inr: number; waste_percentage: number }>();
  for (const trend of trends) {
    const month = trend.period.slice(0, 7);
    const row = groups.get(month) ?? { period: month, prepared_kg: 0, consumed_kg: 0, wasted_kg: 0, estimated_cost_inr: 0, waste_percentage: 0 };
    row.prepared_kg += trend.prepared_kg;
    row.consumed_kg += trend.consumed_kg;
    row.wasted_kg += trend.wasted_kg;
    row.estimated_cost_inr += trend.estimated_cost_inr ?? 0;
    groups.set(month, row);
  }
  return [...groups.values()].map((row) => ({ ...row, waste_percentage: row.prepared_kg ? row.wasted_kg / row.prepared_kg * 100 : 0 }));
}

export function MoreScreen() {
  const navigation = useNavigation<any>();
  const links = [
    { title: 'Alerts', detail: 'Rule-based local review prompts', route: 'Alerts', icon: CircleAlert },
    { title: 'Sustainability', detail: 'Food quantities and recorded cost', route: 'Sustainability', icon: Leaf },
    { title: 'Camera capture', detail: 'Capture a meal photo without fabricated detection', route: 'Camera', icon: Camera },
    { title: 'About & local data', detail: 'Connection, backup, camera, and sync', route: 'About', icon: Database },
  ];
  return <Screen title="More" eyebrow="FOODWISE" subtitle="Local-first tools and project information.">
    {links.map(({ title, detail, route, icon: Icon }) => <Pressable key={route} onPress={() => navigation.getParent()?.navigate(route)} style={styles.moreLink}>
      <View style={styles.moreIcon}><Icon size={19} color={colors.terracotta} /></View>
      <View style={styles.headerCopy}><Text style={styles.recordMeal}>{title}</Text><Text style={styles.subtitle}>{detail}</Text></View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>)}
  </Screen>;
}

export function AboutScreen() {
    const navigation = useNavigation<any>();
  const { database } = useFoodWiseDatabase();
  const { internet, backend, models, modelError, apiBaseUrl, setApiBaseUrl, checkBackend, syncNow, syncMessage } = useAppServices();
  const [urlDraft, setUrlDraft] = useState(apiBaseUrl);
  const [pending, setPending] = useState(0);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  useFocusEffect(useCallback(() => { setUrlDraft(apiBaseUrl); if (database) void getPendingSyncCount(database).then(setPending); }, [apiBaseUrl, database]));

  const shareFile = async (name: string, content: string, mimeType: string) => {
    const directory = FileSystem.documentDirectory;
    if (!directory) throw new Error('Local document storage is unavailable.');
    const uri = `${directory}${name}`;
    await FileSystem.writeAsStringAsync(uri, content);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType, dialogTitle: `FoodWise ${name}` });
    else Alert.alert('File created', uri);
  };
  const exportCsv = async () => {
    if (!database) return;
    const rows = await listRecords(database);
    const headings = ['record_id', 'date', 'meal_category', 'menu_name', 'food_prepared_kg', 'food_consumed_kg', 'food_wasted_kg', 'estimated_waste_cost_inr'];
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const csv = [headings.map(quote).join(','), ...rows.map((row) => [row.record_id, row.date, row.meal_category, row.menu_name, row.food_prepared_kg, row.food_consumed_kg, row.food_wasted_kg, row.estimated_waste_cost_inr].map(quote).join(','))].join('\r\n');
    await shareFile(`foodwise-records-${Date.now()}.csv`, csv, 'text/csv');
  };
  const backup = async () => {
    if (!database) return;
    await shareFile(`foodwise-backup-${Date.now()}.json`, JSON.stringify(await exportBackupData(database), null, 2), 'application/json');
  };
  const restore = async () => {
    if (!database) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled) return;
    Alert.alert('Replace local data?', 'A private safety backup will be created before imported data replaces records on this device.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => { void (async () => {
        setBusy(true); setActionError('');
        try {
          const directory = FileSystem.documentDirectory;
          if (!directory) throw new Error('Local document storage is unavailable.');
          const safetyUri = `${directory}foodwise-before-restore-${Date.now()}.json`;
          await FileSystem.writeAsStringAsync(safetyUri, JSON.stringify(await exportBackupData(database), null, 2));
          const content = await FileSystem.readAsStringAsync(picked.assets[0].uri);
          const count = await restoreBackupData(database, JSON.parse(content));
          Alert.alert('Restore complete', `${count} local records restored. Safety backup: ${safetyUri}`);
          setPending(await getPendingSyncCount(database));
        } catch (error) { setActionError(error instanceof Error ? error.message : 'Backup restore failed.'); }
        finally { setBusy(false); }
      })(); } },
    ]);
  };

  return <Screen title="FoodWise on this device" eyebrow="ABOUT & LOCAL DATA" subtitle="Records and inference are local. Connecting FastAPI is optional for sync.">
    <StatusBanner title={internet === false ? 'Internet unavailable' : internet === true ? 'Internet available' : 'Internet status unknown'} detail="This status is separate from local FastAPI connectivity." tone={internet === false ? 'warning' : 'neutral'} />
    <StatusBanner title={backendLabel(backend)} detail={backendDetail(backend)} tone={backend === 'ready' ? 'good' : backend === 'unavailable' ? 'warning' : 'neutral'} />
    <StatusBanner title={models === 'ready' ? 'Local AI ready' : models === 'loading' ? 'Loading local models' : 'Local model loading failed'} detail={models === 'failed' ? modelError : 'Baseline and preparation optimization run on-device.'} tone={models === 'failed' ? 'error' : models === 'ready' ? 'good' : 'neutral'} />
    <Panel title="Local server (optional)" subtitle="On a phone, use the computer's LAN IP and keep both devices on the same local network. The server does not need internet.">
      <TextField label="FastAPI base URL" value={urlDraft} onChangeText={setUrlDraft} placeholder="http://192.168.1.20:8002" helper="Use a trusted local network address; do not enter credentials here." />
      <ActionButton label="Save local server" onPress={() => { void setApiBaseUrl(urlDraft).catch((error) => setActionError(explainApiError(error))); }} />
      {backend === 'ready' ? <Text style={styles.syncText}>Server available · {pending} queued local changes</Text> : null}
      <View style={styles.buttonRow}>
        <ActionButton label="Sync now" kind="light" onPress={() => { void syncNow().then((result) => { setPending((count) => Math.max(0, count - result.synced)); }).catch((error) => setActionError(explainApiError(error))); }} disabled={backend !== 'ready' || pending === 0} />
          <ActionButton label="Check server" kind="light" onPress={() => { void checkBackend(); }} compact />
      </View>
      {syncMessage ? <Text style={styles.syncText}>{syncMessage}</Text> : null}
      {actionError ? <StatusBanner title="Local data action failed" detail={actionError} tone="error" /> : null}
    </Panel>
    <Panel title="On-device storage" subtitle="Android app-private SQLite; no cloud database.">
      <Text style={styles.recordLine}>Database file: {database?.databasePath ?? 'Unavailable'}</Text>
      <Text style={styles.recordLine}>Pending sync actions: {pending}</Text>
      <View style={styles.buttonRow}><ActionButton label="Export records CSV" kind="light" onPress={() => void exportCsv().catch((error) => setActionError(explainApiError(error)))} /><ActionButton label="Backup JSON" kind="light" onPress={() => void backup().catch((error) => setActionError(explainApiError(error)))} /></View>
      <ActionButton label="Restore backup" kind="danger" onPress={() => void restore()} disabled={busy} loading={busy} />
      <Text style={styles.fieldHelper}>Restore validates the full backup before a single SQLite transaction; a private safety copy is created first.</Text>
    </Panel>
    <Panel title="Camera capture" subtitle="Capture only. No local food recognition model is configured.">
      <ActionButton label="Open camera" kind="light" onPress={() => navigation.navigate('Camera')} />
    </Panel>
    <Panel title="Future integrations"><Text style={styles.recordLine}>Food classification, weighing scales, and blockchain audit are not enabled. The app will not invent readings or recognition results.</Text></Panel>
  </Screen>;
}

function backendLabel(value: string) {
  return value === 'ready' ? 'Local FastAPI available' : value === 'unavailable' ? 'Local backend unavailable' : value === 'database' ? 'Local database unavailable' : value === 'model' ? 'Backend model artifact unavailable' : value === 'not-configured' ? 'No local server configured' : 'Checking local FastAPI';
}
function backendDetail(value: string) {
  return value === 'ready' ? 'Optional sync server is reachable over the configured local address.' : value === 'unavailable' ? 'Local records and on-device inference are still usable.' : value === 'not-configured' ? 'Server sync is optional; the app operates from its local SQLite database.' : 'Check the local API diagnostics and backend logs.';
}

export function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [photo, setPhoto] = useState('');
  const [error, setError] = useState('');
  if (!permission) return <Screen title="Food image capture" eyebrow="CAMERA"><LoadingState /></Screen>;
  if (!permission.granted) return <Screen title="Food image capture" eyebrow="CAMERA" subtitle="Camera access is used only after permission is granted."><Panel title="Camera permission"><ActionButton label="Grant camera access" onPress={() => void requestPermission()} /><Text style={styles.fieldHelper}>No photo is uploaded automatically. Classification is not available in this build.</Text></Panel></Screen>;
  return <Screen title="Capture a meal" eyebrow="CAMERA" subtitle="FoodWise stores a photo only when you choose to capture it. No recognition result is fabricated.">
    <View style={styles.cameraFrame}><CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" /></View>
    <ActionButton label="Capture photo" onPress={() => { void camera.current?.takePictureAsync({ quality: 0.75 }).then((result) => setPhoto(result?.uri ?? '')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Camera capture failed.')); }} />
    {error ? <StatusBanner title="Camera failed" detail={error} tone="error" /> : null}
    {photo ? <Panel title="Photo captured"><Image source={{ uri: photo }} style={styles.previewImage} resizeMode="cover" /><StatusBanner title="No classification performed" detail="A local food detector is not configured, so no food label or quantity is shown." /></Panel> : null}
  </Screen>;
}

function RecordRow({ record }: { record: FoodRecord }) {
  return <View style={styles.recordRow}>
    <View style={styles.recordBullet} />
    <View style={styles.headerCopy}><Text style={styles.recordMeal}>{record.meal_category}</Text><Text style={styles.subtitle}>{shortDate(record.date)} · prepared {numberFormat.format(record.food_prepared_kg ?? 0)} kg</Text></View>
    <Text style={styles.recordWaste}>{numberFormat.format(record.food_wasted_kg ?? 0)} kg</Text>
  </View>;
}

const styles = StyleSheet.create({
  localMark: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingTop: 6 },
  localMarkText: { color: colors.green, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 },
  subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  fieldHelper: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  panelAction: { color: colors.green, fontSize: 10, fontWeight: '700' },
  recordRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  recordBullet: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.terracotta },
  headerCopy: { flex: 1, gap: 3 },
  recordMeal: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  recordWaste: { color: colors.terracotta, fontSize: 14, fontWeight: '700' },
  recordLine: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  syncText: { color: colors.green, fontSize: 11, fontWeight: '600' },
  formGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, backgroundColor: colors.greenSoft, borderRadius: 8, padding: 10 },
  resultItem: { width: '47%', gap: 4, padding: 4 },
  resultLabel: { color: colors.muted, fontSize: 10 },
  resultValue: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  historyRow: { color: colors.ink, fontSize: 12, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  flagRow: { minHeight: 42, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flagValue: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  flagOn: { color: colors.green },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  moreIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.terracottaSoft, alignItems: 'center', justifyContent: 'center' },
  cameraFrame: { height: 400, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.ink },
  previewImage: { width: '100%', height: 220, borderRadius: 10 },
});
