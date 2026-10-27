const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseFoods, quantity } = require('../services/foodImport');
const { calculateTargets, eligibleFoods, buildMealPlan, buildWorkoutPlan } = require('../services/fitnessEngine');
const csv = fs.readFileSync(path.join(__dirname, '../seed/data/sample-foods.csv'), 'utf8');
const foods = parseFoods(csv, 'TEST SAMPLE').foods.map((food, index) => ({ ...food, _id: String(index + 1) }));
const exercises = require('../seed/data/exercises.json').map((exercise, index) => ({ ...exercise, _id: String(index + 1) }));
const profile = { age: 30, gender: 'male', height: 175, weight: 75, activityLevel: 'moderate', goal: 'maintenance', dietPreference: 'vegan', allergies: [], workoutDays: 3, equipment: 'none' };

test('CSV conversion handles units, explicit nutrition basis, duplicates and invalid rows', () => {
  assert.equal(quantity('1 kg', 'mass'), 1000);
  assert.equal(quantity('500 mg', 'mass'), 0.5);
  assert.ok(Math.abs(quantity('418.4 kJ', 'energy') - 100) < 0.000001);
  assert.throws(() => quantity('10 calories junk', 'energy'));
  assert.throws(() => quantity('-1 g', 'mass'));
  const header = csv.split('\n')[0];
  const line = 'Example,protein,418.4 kJ,10000 mg,15 g,2 g,2 g,0.2 kg,vegan,none,lunch,per_serving';
  const result = parseFoods([header, line, line.replace('Example', ' example '), line.replace('Example', 'Missing').replace('10000 mg', ''), line.replace('Example', 'Unsafe').replace(',none,', ',unknown,')].join('\n'), 'TEST');
  assert.equal(result.foods.length, 1);
  assert.equal(result.foods[0].calories, 50);
  assert.equal(result.foods[0].protein, 5);
  assert.equal(result.report.duplicates, 1);
  assert.equal(result.report.rejected.length, 2);
  assert.throws(() => parseFoods('name,calories\nExample,10', 'TEST'));
});

test('sample data is valid and explicitly labeled by import source', () => {
  const result = parseFoods(csv, 'TEST SAMPLE');
  assert.equal(result.foods.length, 50);
  assert.deepEqual(result.report.rejected, []);
  assert.ok(result.foods.every(food => food.source === 'TEST SAMPLE'));
});

test('Mifflin–St Jeor, BMI, energy balance and goal adjustments match known arithmetic', () => {
  const maintenance = calculateTargets(profile);
  assert.equal(maintenance.metrics.bmr, 1698.8);
  assert.equal(maintenance.metrics.bmi, 24.5);
  assert.equal(maintenance.targets.calories, 2633);
  assert.equal(maintenance.targets.protein, 90);
  assert.ok(Math.abs(maintenance.targets.protein * 4 + maintenance.targets.carbs * 4 + maintenance.targets.fat * 9 - maintenance.targets.calories) < 1);
  assert.ok(calculateTargets({ ...profile, goal: 'fat-loss' }).targets.calories < maintenance.targets.calories);
  assert.ok(calculateTargets({ ...profile, goal: 'muscle-gain' }).targets.calories > maintenance.targets.calories);
  assert.throws(() => calculateTargets({ ...profile, weight: NaN }), { code: 'INVALID_PROFILE' });
  assert.throws(() => calculateTargets({ ...profile, weight: 45, goal: 'fat-loss' }), { code: 'GOAL_REQUIRES_REVIEW' });
});

test('diet and allergen filters exclude conflicts and unknown classifications', () => {
  const filtered = eligibleFoods({ ...profile, allergies: ['soya', 'gluten', 'nuts'] }, foods);
  assert.ok(filtered.length > 0);
  assert.ok(filtered.every(food => food.dietTags.includes('vegan') && !food.allergens.some(value => ['soy', 'gluten', 'wheat', 'tree-nut'].includes(value))));
  assert.equal(eligibleFoods(profile, [{ ...foods[0], allergens: undefined }]).length, 0);
  assert.equal(eligibleFoods(profile, [{ ...foods[0], allergens: ['unmapped'] }]).length, 0);
});

test('seven-day plans are deterministic, use dataset IDs, honor allergies and bound repetition', () => {
  const p = { ...profile, allergies: ['milk', 'egg', 'peanut', 'tree-nut'] };
  const a = buildMealPlan(p, foods), b = buildMealPlan(p, foods);
  assert.deepEqual(a, b);
  const lookup = new Map(foods.map(food => [food._id, food]));
  const uses = new Map();
  assert.equal(a.days.length, 7);
  for (const day of a.days) {
    assert.deepEqual(day.meals.map(meal => meal.type), ['breakfast', 'lunch', 'snack', 'dinner']);
    const daily = new Set();
    let calories = 0;
    for (const meal of day.meals) for (const item of meal.foods) {
      assert.ok(lookup.has(item.food));
      assert.ok(!daily.has(item.food)); daily.add(item.food);
      uses.set(item.food, (uses.get(item.food) || 0) + 1);
      assert.ok(!lookup.get(item.food).allergens.some(value => p.allergies.includes(value)));
      assert.ok(item.grams > 0 && item.grams <= 600);
      calories += item.nutrition.calories;
    }
    assert.ok(Math.abs(day.totals.calories - calories) < 0.2);
  }
  assert.ok([...uses.values()].every(count => count <= 4));
  assert.throws(() => buildMealPlan(profile, foods.slice(0, 1)), { code: 'INSUFFICIENT_FOODS' });
});

test('every diet generates a complete plan and reports large target deviations', () => {
  for (const dietPreference of ['veg', 'non-veg', 'vegan', 'keto']) {
    const plan = buildMealPlan({ ...profile, dietPreference }, foods);
    assert.equal(plan.days.length, 7);
    for (const day of plan.days) {
      if (Math.abs(day.deviation.calories) > 15 || Math.abs(day.deviation.protein) > 25) assert.ok(plan.warnings.some(message => message.startsWith(`Day ${day.day}:`)));
    }
    if (dietPreference === 'keto') assert.ok(plan.targets.carbs <= 50);
  }
});

test('workouts cover every day count and respect equipment, goals and rest days', () => {
  const lookup = new Map(exercises.map(item => [item._id, item]));
  for (const equipment of ['none', 'home', 'gym']) for (let workoutDays = 1; workoutDays <= 7; workoutDays++) {
    const plan = buildWorkoutPlan({ ...profile, workoutDays, equipment }, exercises);
    assert.equal(plan.days.length, workoutDays);
    assert.equal(plan.restDays.length, 7 - workoutDays);
    assert.equal(new Set(plan.days.map(day => day.day)).size, workoutDays);
    for (const day of plan.days) for (const item of day.exercises) {
      assert.ok(lookup.has(item.exercise));
      if (equipment === 'none') assert.equal(lookup.get(item.exercise).equipment, 'none');
      if (equipment === 'home') assert.notEqual(lookup.get(item.exercise).equipment, 'gym');
      assert.ok(item.sets > 0 && item.restSeconds >= 0);
    }
  }
  assert.throws(() => buildWorkoutPlan(profile, []), { code: 'INSUFFICIENT_EXERCISES' });
});
