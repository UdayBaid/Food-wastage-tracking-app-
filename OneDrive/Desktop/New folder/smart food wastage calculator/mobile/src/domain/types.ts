export type MealCategory = 'Breakfast' | 'Lunch' | 'Dinner';
export type SyncState = 'local' | 'pending' | 'synced' | 'conflict' | 'pending-delete';

export interface FoodRecord {
  id: string;
  record_id: string;
  server_id: number | null;
  date: string;
  year: number | null;
  month: number | null;
  day_of_week: number | null;
  day_name: string | null;
  meal_category: MealCategory;
  menu_name: string | null;
  hostel_capacity: number | null;
  residents_present: number | null;
  advance_bookings: number | null;
  weekend_flag: number | null;
  exam_flag: number | null;
  vacation_flag: number | null;
  festival_flag: number | null;
  special_event_flag: number | null;
  temperature_c: number | null;
  rain_index: number | null;
  menu_popularity_score: number | null;
  student_turnout: number | null;
  avg_consumed_per_student_kg: number | null;
  food_consumed_kg: number | null;
  food_prepared_kg: number | null;
  food_wasted_kg: number | null;
  waste_percentage: number | null;
  estimated_waste_cost_inr: number | null;
  updated_at: string;
  synced_at: string | null;
  sync_state: SyncState;
  base_snapshot: string | null;
  conflict_snapshot: string | null;
  deleted: number;
}

export type FoodRecordInput = Pick<FoodRecord, 'date' | 'meal_category'> & Partial<Omit<FoodRecord,
  'id' | 'record_id' | 'server_id' | 'date' | 'meal_category' | 'updated_at' | 'synced_at' | 'sync_state' | 'base_snapshot' | 'conflict_snapshot' | 'deleted'
>>;

export interface PredictionHistory {
  id: string;
  meal_category: MealCategory;
  predicted_waste_kg: number;
  input_json: string;
  created_at: string;
  model_name: string;
}

export interface OptimizationHistory {
  id: string;
  meal_category: MealCategory;
  expected_demand_kg: number;
  recommended_preparation_kg: number;
  predicted_waste_kg: number;
  estimated_shortage_kg: number;
  estimated_penalty_cost: number;
  input_json: string;
  created_at: string;
}

export interface PredictionInput {
  meal_category: MealCategory;
  residents_present: number;
  student_turnout: number;
  hostel_capacity: number;
  day_of_week: number;
  month: number;
  is_weekend: number;
}

export interface OptimizationInput {
  meal_category: MealCategory;
  student_turnout: number;
  residents_present: number;
  hostel_capacity: number;
  advance_bookings: number;
  menu_popularity_score: number;
  expected_demand_kg: number;
  day_of_week: number;
  month: number;
  weekend_flag: number;
  exam_flag: number;
  vacation_flag: number;
  festival_flag: number;
  special_event_flag: number;
  temperature_c: number;
  rain_index: number;
  waste_cost_per_kg: number;
  shortage_cost_per_kg: number;
}

export interface OptimizationResult {
  recommended_preparation_kg: number;
  predicted_waste_kg: number;
  estimated_shortage_kg: number;
  estimated_penalty_cost: number;
  top_options: Array<{
    prepared_kg: number;
    predicted_waste_kg: number;
    estimated_shortage_kg: number;
    estimated_penalty_cost: number;
  }>;
}
