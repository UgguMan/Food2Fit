const { AppError } = require('../middleware/errors');
const { ACTIVITY, GOALS, DIETS, ALLERGENS, normalizeAllergen, MEALS, NUTRIENTS } = require('./fitnessConstants');
const round = value => Math.round(value * 10) / 10;
const empty = () => Object.fromEntries(NUTRIENTS.map(key => [key, 0]));
const sum = items => Object.fromEntries(NUTRIENTS.map(key => [key, round(items.reduce((total, item) => total + item[key], 0))]));

function validateProfile(profile) {
  const ranges = { age: [18, 100], height: [100, 250], weight: [30, 350], workoutDays: [1, 7] };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(profile[key]) || profile[key] < min || profile[key] > max) throw new AppError(400, 'INVALID_PROFILE', `Invalid ${key}.`);
  }
  if (!Number.isInteger(profile.age) || !Number.isInteger(profile.workoutDays) || !['male', 'female'].includes(profile.gender)
    || !Object.hasOwn(ACTIVITY, profile.activityLevel) || !GOALS.includes(profile.goal) || !DIETS.includes(profile.dietPreference)
    || !['none', 'home', 'gym'].includes(profile.equipment) || !Array.isArray(profile.allergies)
    || profile.allergies.length > 30 || profile.allergies.some(value => typeof value !== 'string' || !ALLERGENS.includes(normalizeAllergen(value)))) {
    throw new AppError(400, 'INVALID_PROFILE', 'Profile preferences are invalid.');
  }
}
function calculateTargets(profile) {
  validateProfile(profile);
  const bmi = profile.weight / (profile.height / 100) ** 2;
  const bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + (profile.gender === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY[profile.activityLevel];
  const delta = profile.goal === 'fat-loss' ? -Math.min(400, tdee * 0.15) : profile.goal === 'muscle-gain' ? 250 : 0;
  // Conservative product bounds; not individualized medical prescriptions.
  const calories = Math.round(Math.max(profile.gender === 'male' ? 1500 : 1200, Math.min(4500, tdee + delta)));
  const desiredProtein = profile.weight * (profile.goal === 'maintenance' ? 1.2 : 1.6);
  const protein = Math.min(desiredProtein, calories * 0.35 / 4);
  const keto = profile.dietPreference === 'keto';
  const carbs = keto ? Math.min(50, calories * 0.08 / 4) : (calories - protein * 4 - calories * 0.3) / 4;
  const fat = (calories - protein * 4 - carbs * 4) / 9;
  const warnings = [];
  if (calories !== Math.round(tdee + delta)) warnings.push('Calorie target was bounded by the planner’s 1200/1500–4500 kcal limits; review the estimate before use.');
  if (protein < desiredProtein) warnings.push('Protein target was capped at 35% of estimated energy.');
  if (bmi < 18.5 && profile.goal === 'fat-loss') throw new AppError(422, 'GOAL_REQUIRES_REVIEW', 'A fat-loss plan is not available for this BMI. Choose maintenance or review your goal with a qualified professional.');
  return { metrics: { bmi: round(bmi), bmr: round(bmr), tdee: round(tdee) },
    targets: { calories, protein: round(protein), carbs: round(carbs), fat: round(fat), fiber: round(calories / 1000 * 14) }, warnings };
}
function eligibleFoods(profile, foods) {
  const allergies = new Set(profile.allergies.map(normalizeAllergen));
  return foods.filter(food => {
    if (!Array.isArray(food.dietTags) || !food.dietTags.length || !Array.isArray(food.allergens) || !Array.isArray(food.mealTypes)) return false;
    if (profile.dietPreference !== 'non-veg' && !food.dietTags.includes(profile.dietPreference)) return false;
    const allergens = food.allergens.map(normalizeAllergen);
    if (allergens.some(value => !ALLERGENS.includes(value) || allergies.has(value))) return false;
    if (allergies.has('gluten') && allergens.includes('wheat')) return false;
    if (allergies.has('wheat') && allergens.includes('gluten')) return false;
    return food._id && food.calories > 0 && food.servingGrams > 0 && NUTRIENTS.every(key => Number.isFinite(food[key]) && food[key] >= 0);
  }).sort((a, b) => a.name.localeCompare(b.name));
}
function distance(nutrition, target) {
  const weights = { calories: 2, protein: 1.5, carbs: 0.7, fat: 0.7, fiber: 0.15 };
  return NUTRIENTS.reduce((score, key) => score + weights[key] * ((nutrition[key] - target[key]) / Math.max(target[key], 1)) ** 2, 0);
}
function buildMealPlan(profile, foods) {
  const result = calculateTargets(profile);
  const eligible = eligibleFoods(profile, foods);
  const uses = new Map(), previousDay = new Map();
  const days = [], warnings = [...result.warnings];
  const proportions = [0.25, 0.3, 0.15, 0.3];
  for (let day = 1; day <= 7; day++) {
    const usedToday = new Set();
    const meals = [];
    for (const [index, type] of MEALS.entries()) {
      const target = Object.fromEntries(NUTRIENTS.map(key => [key, result.targets[key] * proportions[index]]));
      const pool = eligible.filter(food => food.mealTypes.includes(type) && !usedToday.has(String(food._id)) && (uses.get(String(food._id)) || 0) < 4);
      if (!pool.length) throw new AppError(422, 'INSUFFICIENT_FOODS', `Not enough eligible foods for ${type} on day ${day}. Add foods matching your diet/allergies and meal types; limits were not relaxed.`);
      const variants = pool.flatMap(food => {
        const ideal = target.calories / food.calories * 100;
        const portions = [...new Set([0.5, 1, 1.5, 2].map(multiplier => Math.round(Math.min(600, food.servingGrams * multiplier))).concat(Math.round(Math.min(600, food.servingGrams * 2, Math.max(food.servingGrams * 0.5, ideal)))))];
        return portions.filter(grams => grams >= 1).map(grams => ({ food: food._id, name: food.name, grams,
          nutrition: Object.fromEntries(NUTRIENTS.map(key => [key, round(food[key] * grams / 100)])),
          penalty: (uses.get(String(food._id)) || 0) * 0.12 + (previousDay.get(String(food._id)) === day - 1 ? 0.12 : 0),
        }));
      }).sort((a, b) => distance(a.nutrition, target) + a.penalty - distance(b.nutrition, target) - b.penalty).slice(0, 160);
      let beam = [{ foods: [], nutrition: empty(), penalty: 0 }], best;
      for (let depth = 0; depth < 3; depth++) {
        const next = [];
        for (const state of beam) for (const item of variants) {
          if (state.foods.some(selected => String(selected.food) === String(item.food))) continue;
          const nutrition = sum([state.nutrition, item.nutrition]);
          const penalty = state.penalty + item.penalty;
          const candidate = { foods: [...state.foods, item], nutrition, penalty, score: distance(nutrition, target) + penalty + depth * 0.02 };
          if (!best || candidate.score < best.score) best = candidate;
          next.push(candidate);
        }
        beam = next.sort((a, b) => a.score - b.score).slice(0, 8);
      }
      for (const item of best.foods) {
        const key = String(item.food);
        uses.set(key, (uses.get(key) || 0) + 1); usedToday.add(key); previousDay.set(key, day);
      }
      meals.push({ type, foods: best.foods.map(({ penalty, ...item }) => item), totals: best.nutrition });
    }
    const totals = sum(meals.map(meal => meal.totals));
    const deviation = Object.fromEntries(NUTRIENTS.map(key => [key, round((totals[key] - result.targets[key]) / result.targets[key] * 100)]));
    if (Math.abs(deviation.calories) > 15 || Math.abs(deviation.protein) > 25) warnings.push(`Day ${day}: dataset portions differ from the calorie target by ${deviation.calories}% and protein target by ${deviation.protein}%.`);
    if (profile.dietPreference === 'keto' && totals.carbs > result.targets.carbs * 1.15) warnings.push(`Day ${day}: available foods exceed the low-carbohydrate target; this plan does not guarantee ketosis.`);
    days.push({ day, meals, totals, deviation });
  }
  return { ...result, days, warnings, sources: [...new Set(eligible.map(food => food.source))], algorithmVersion: '1.0',
    notes: ['Illustrative estimates, not a medical diet. Check ingredient labels and cross-contact for allergies.', 'Food amounts use the preparation state named in the dataset. Targets and actual totals are shown separately.'] };
}
function buildWorkoutPlan(profile, exercises) {
  validateProfile(profile);
  const allowed = profile.equipment === 'gym' ? ['none', 'home', 'gym'] : profile.equipment === 'home' ? ['none', 'home'] : ['none'];
  const pool = exercises.filter(item => allowed.includes(item.equipment) && item.difficulty !== 'advanced' && item.goalTags.includes(profile.goal));
  const schedule = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 6], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6], 7: [1, 2, 3, 4, 5, 6, 7] }[profile.workoutDays];
  const counts = new Map();
  const days = schedule.map((day, index) => {
    const recovery = profile.workoutDays >= 6 && index === schedule.length - 1;
    const cardio = recovery || (profile.goal === 'fat-loss' && profile.workoutDays >= 4 && index === schedule.length - 1);
    let title, movements;
    if (cardio) { title = recovery ? 'Active recovery' : 'Low-impact intervals'; movements = ['cardio', 'core']; }
    else if (profile.workoutDays <= 3) { title = 'Full body'; movements = ['push', 'pull', 'legs', 'core']; }
    else { title = ['Push', 'Pull', 'Legs'][index % 3]; movements = [[ 'push', 'core' ], [ 'pull', 'core' ], [ 'legs', 'core' ]][index % 3]; }
    const selected = [];
    for (const movement of movements) {
      const candidates = pool.filter(item => item.movement === movement).sort((a, b) => (counts.get(String(a._id)) || 0) - (counts.get(String(b._id)) || 0) || a.name.localeCompare(b.name));
      if (!candidates.length) throw new AppError(422, 'INSUFFICIENT_EXERCISES', `No ${movement} exercises match your equipment and goal. Seed the exercise collection.`);
      const count = !cardio && movements.length === 2 && movement !== 'core' ? 2 : 1;
      for (const exercise of candidates.slice(0, count)) {
        counts.set(String(exercise._id), (counts.get(String(exercise._id)) || 0) + 1);
        selected.push({ exercise: exercise._id, name: exercise.name,
          sets: recovery ? 2 : profile.goal === 'muscle-gain' ? 3 : 2,
          reps: movement === 'cardio' ? (recovery ? '3 minutes easy pace' : '30 seconds comfortable effort') : movement === 'core' ? '8–12 controlled reps' : profile.goal === 'muscle-gain' ? '8–12' : '10–15',
          restSeconds: recovery ? 30 : profile.goal === 'muscle-gain' ? 90 : 60 });
      }
    }
    return { day, title, exercises: selected };
  });
  return { days, restDays: [1, 2, 3, 4, 5, 6, 7].filter(day => !schedule.includes(day)),
    notes: ['Start with 5 minutes of easy movement. Use controlled, pain-free motion and a load you can manage.', 'Home equipment assumes dumbbells or resistance bands. Choose none if you do not have them.', 'Interval days are low-impact introductions, not all-out HIIT. Six/seven-day schedules include an active-recovery day.'] };
}
module.exports = { calculateTargets, eligibleFoods, buildMealPlan, buildWorkoutPlan, validateProfile };
