import { Asset } from 'expo-asset';
import { InferenceSession, Tensor } from 'onnxruntime-react-native';
import type { OptimizationInput, OptimizationResult, PredictionInput } from '../domain/types';

const baselineAsset = require('../../assets/models/foodwise_baseline.onnx');
const optimizationAsset = require('../../assets/models/foodwise_optimization.onnx');
const semiSupervisedAsset = require('../../assets/models/foodwise_semi_supervised.onnx');

let baselineSession: InferenceSession | null = null;
let optimizationSession: InferenceSession | null = null;
let semiSupervisedSession: InferenceSession | null = null;
let loadError = '';

async function openBundledModel(assetModule: number): Promise<InferenceSession> {
  const asset = Asset.fromModule(assetModule);
  await asset.downloadAsync();
  const modelPath = asset.localUri ?? asset.uri;
  if (!modelPath) throw new Error('The local ONNX model asset could not be resolved.');
  return InferenceSession.create(modelPath);
}

export async function initializeLocalModels(): Promise<void> {
  try {
    [baselineSession, optimizationSession] = await Promise.all([
      openBundledModel(baselineAsset),
      openBundledModel(optimizationAsset),
    ]);
    loadError = '';
  } catch (error) {
    loadError = error instanceof Error ? error.message : 'Local ML models could not be loaded.';
    throw new Error(`Local ML model loading failed: ${loadError}`);
  }
}

export function getModelLoadError(): string {
  return loadError;
}

function numberTensor(value: number): Tensor {
  return new Tensor('float32', new Float32Array([value]), [1, 1]);
}

function predictionFeeds(session: InferenceSession, input: PredictionInput | OptimizationInput, preparedKg?: number) {
  const numericValues: Record<string, number> = {
    residents_present: input.residents_present,
    student_turnout: input.student_turnout,
    hostel_capacity: input.hostel_capacity,
    day_of_week: input.day_of_week,
    month: input.month,
    is_weekend: 'is_weekend' in input ? input.is_weekend : input.weekend_flag,
    advance_bookings: 'advance_bookings' in input ? input.advance_bookings : 0,
    menu_popularity_score: 'menu_popularity_score' in input ? input.menu_popularity_score : 0,
    food_prepared_kg: preparedKg ?? ('expected_demand_kg' in input ? input.expected_demand_kg : 0),
    weekend_flag: 'weekend_flag' in input ? input.weekend_flag : ('is_weekend' in input ? input.is_weekend : 0),
    exam_flag: 'exam_flag' in input ? input.exam_flag : 0,
    vacation_flag: 'vacation_flag' in input ? input.vacation_flag : 0,
    festival_flag: 'festival_flag' in input ? input.festival_flag : 0,
    special_event_flag: 'special_event_flag' in input ? input.special_event_flag : 0,
    temperature_c: 'temperature_c' in input ? input.temperature_c : 25,
    rain_index: 'rain_index' in input ? input.rain_index : 0,
  };
  const feeds: Record<string, Tensor> = {};
  for (const name of session.inputNames) {
    feeds[name] = name === 'meal_category'
      ? new Tensor('string', [input.meal_category], [1, 1])
      : numberTensor(numericValues[name] ?? 0);
  }
  return feeds;
}

async function predictWithSession(session: InferenceSession, input: PredictionInput | OptimizationInput, preparedKg?: number): Promise<number> {
  const output = await session.run(predictionFeeds(session, input, preparedKg));
  const value = output[session.outputNames[0]]?.data[0];
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Local ML model returned an invalid prediction.');
  return Math.max(0, value);
}

export async function predictWaste(input: PredictionInput): Promise<number> {
  if (!baselineSession) throw new Error(loadError || 'Local baseline model is not initialized.');
  return Number((await predictWithSession(baselineSession, input)).toFixed(2));
}

export async function predictSemiSupervised(input: PredictionInput): Promise<number> {
  if (!semiSupervisedSession) {
    semiSupervisedSession = await openBundledModel(semiSupervisedAsset);
  }
  if (!semiSupervisedSession) throw new Error(loadError || 'Local semi-supervised model is not initialized.');
  return Number((await predictWithSession(semiSupervisedSession, input)).toFixed(2));
}

export async function optimizePreparation(input: OptimizationInput): Promise<OptimizationResult> {
  if (!optimizationSession) throw new Error(loadError || 'Local optimization model is not initialized.');
  if (!(input.expected_demand_kg > 0)) throw new Error('Expected demand must be greater than zero.');

  const firstCandidate = Math.max(1, input.expected_demand_kg * 0.7);
  const endCandidate = input.expected_demand_kg * 1.31;
  const options: OptimizationResult['top_options'] = [];
  for (let preparedKg = firstCandidate; preparedKg < endCandidate; preparedKg += 0.5) {
    const rawWaste = await predictWithSession(optimizationSession, input, preparedKg);
    const predictedWaste = Math.min(rawWaste, preparedKg);
    const usableFood = preparedKg - predictedWaste;
    const shortage = Math.max(0, input.expected_demand_kg - usableFood);
    const cost = input.waste_cost_per_kg * predictedWaste + input.shortage_cost_per_kg * shortage;
    options.push({
      prepared_kg: Number(preparedKg.toFixed(2)),
      predicted_waste_kg: Number(predictedWaste.toFixed(2)),
      estimated_shortage_kg: Number(shortage.toFixed(2)),
      estimated_penalty_cost: Number(cost.toFixed(2)),
    });
  }
  if (options.length === 0) throw new Error('No preparation candidates were generated.');
  options.sort((a, b) => a.estimated_penalty_cost - b.estimated_penalty_cost);
  const best = options[0];
  return {
    recommended_preparation_kg: best.prepared_kg,
    predicted_waste_kg: best.predicted_waste_kg,
    estimated_shortage_kg: best.estimated_shortage_kg,
    estimated_penalty_cost: best.estimated_penalty_cost,
    top_options: options.slice(0, 5),
  };
}
