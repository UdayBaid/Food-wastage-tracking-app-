import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const modelsDir = path.resolve(__dirname, '../assets/models');

describe('Local ONNX Models & Wrapper Math', () => {
  test('All bundled ONNX model files and manifest exist with valid sizes', () => {
    const baseline = path.join(modelsDir, 'foodwise_baseline.onnx');
    const optimization = path.join(modelsDir, 'foodwise_optimization.onnx');
    const semiSupervised = path.join(modelsDir, 'foodwise_semi_supervised.onnx');
    const manifestPath = path.join(modelsDir, 'manifest.json');

    assert.ok(fs.existsSync(baseline), 'foodwise_baseline.onnx exists');
    assert.ok(fs.existsSync(optimization), 'foodwise_optimization.onnx exists');
    assert.ok(fs.existsSync(semiSupervised), 'foodwise_semi_supervised.onnx exists');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json exists');

    assert.ok(fs.statSync(baseline).size > 1_000_000, 'Baseline model size > 1MB');
    assert.ok(fs.statSync(optimization).size > 1_000_000, 'Optimization model size > 1MB');
    assert.ok(fs.statSync(semiSupervised).size > 1_000_000, 'Semi-supervised model size > 1MB');
  });

  test('manifest.json specifies expected input contracts for baseline and optimization', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(modelsDir, 'manifest.json'), 'utf-8'));

    assert.equal(manifest.models.baseline.features.length, 7);
    assert.deepEqual(manifest.models.baseline.features, [
      'meal_category', 'residents_present', 'student_turnout', 'hostel_capacity', 'day_of_week', 'month', 'is_weekend'
    ]);

    assert.equal(manifest.models.optimization.features.length, 16);
    assert.ok(manifest.models.optimization.features.includes('food_prepared_kg'));
    assert.ok(manifest.models.optimization.features.includes('meal_category'));
    assert.ok(manifest.models.optimization.features.includes('menu_popularity_score'));
    assert.ok(manifest.models.optimization.max_abs_error < 1e-4);
  });

  test('Preparation candidate generation spans 70% to 130% in 0.5 kg increments', () => {
    const expectedDemand = 50.0;
    const firstCandidate = Math.max(1, expectedDemand * 0.7); // 35.0
    const endCandidate = expectedDemand * 1.31; // 65.5

    const candidates = [];
    for (let preparedKg = firstCandidate; preparedKg < endCandidate; preparedKg += 0.5) {
      candidates.push(Number(preparedKg.toFixed(1)));
    }

    assert.equal(candidates[0], 35.0);
    assert.equal(candidates[1], 35.5);
    assert.equal(candidates[candidates.length - 1], 65.0);
    assert.equal(candidates.length, 61);
  });

  test('Optimization cost function balances waste penalty and shortage penalty', () => {
    const demand = 50.0;
    const wasteCostPerKg = 40.0;
    const shortageCostPerKg = 80.0;

    function calculatePenalty(preparedKg, predictedWasteKg) {
      const actualConsumed = Math.min(demand, preparedKg);
      const shortage = Math.max(0, demand - actualConsumed);
      const wastePenalty = predictedWasteKg * wasteCostPerKg;
      const shortagePenalty = shortage * shortageCostPerKg;
      return {
        wastePenalty,
        shortagePenalty,
        totalPenalty: wastePenalty + shortagePenalty,
      };
    }

    // Scenario A: Under-preparation (prepared = 40 kg, shortage = 10 kg, waste = 1 kg)
    const costA = calculatePenalty(40.0, 1.0);
    // waste: 1 * 40 = 40; shortage: 10 * 80 = 800 => total 840
    assert.equal(costA.shortagePenalty, 800);
    assert.equal(costA.totalPenalty, 840);

    // Scenario B: Over-preparation (prepared = 60 kg, shortage = 0 kg, waste = 10 kg)
    const costB = calculatePenalty(60.0, 10.0);
    // waste: 10 * 40 = 400; shortage: 0 => total 400
    assert.equal(costB.shortagePenalty, 0);
    assert.equal(costB.totalPenalty, 400);

    // Scenario C: Balanced optimal (prepared = 52 kg, shortage = 0 kg, waste = 2.5 kg)
    const costC = calculatePenalty(52.0, 2.5);
    // waste: 2.5 * 40 = 100; shortage: 0 => total 100
    assert.equal(costC.totalPenalty, 100);

    // Optimal should have strictly lower penalty than both extremes
    assert.ok(costC.totalPenalty < costA.totalPenalty);
    assert.ok(costC.totalPenalty < costB.totalPenalty);
  });
});
