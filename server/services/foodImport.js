const { parse } = require('csv-parse/sync');
const { DIETS, ALLERGENS, MEALS, normalizeAllergen } = require('./fitnessConstants');
const normalizeName = value => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
const required = ['name', 'category', 'calories', 'protein', 'carbs', 'fat', 'fiber', 'serving_grams', 'diet_tags', 'allergens', 'meal_types'];

function quantity(input, kind) {
  const value = String(input ?? '').trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(kcal|kj|mg|kg|g)?$/.exec(value);
  if (!match) throw new Error(`Invalid ${kind} quantity`);
  let result = Number(match[1]);
  const unit = match[2] || (kind === 'energy' ? 'kcal' : 'g');
  if (kind === 'energy') {
    if (!['kcal', 'kj'].includes(unit)) throw new Error('Energy must use kcal or kJ');
    if (unit === 'kj') result /= 4.184;
  } else {
    if (!['g', 'kg', 'mg'].includes(unit)) throw new Error('Mass must use g, kg or mg');
    result *= unit === 'kg' ? 1000 : unit === 'mg' ? 0.001 : 1;
  }
  return result;
}
function tags(value, allowed, normalize = value => value.trim().toLowerCase()) {
  const result = [...new Set(String(value).split(/[;|]/).map(normalize).filter(Boolean))];
  if (!result.length || result.some(tag => !allowed.includes(tag))) throw new Error('Missing or unsupported classification');
  return result;
}
function parseFoods(csv, source) {
  if (!source || source.length > 200) throw new Error('A source label of 1–200 characters is required');
  let headers;
  const rows = parse(csv, {
    bom: true, skip_empty_lines: true, trim: true, max_record_size: 16384,
    columns(values) {
      headers = values.map(value => value.trim().toLowerCase().replace(/\s+/g, '_'));
      if (new Set(headers).size !== headers.length || required.some(key => !headers.includes(key))) {
        throw new Error(`CSV needs unique headers including: ${required.join(', ')}`);
      }
      return headers;
    },
  });
  if (!headers || rows.length > 50000) throw new Error('CSV must contain a header and at most 50,000 rows');
  const foods = [], rejected = [], seen = new Set();
  let duplicates = 0;
  rows.forEach((row, index) => {
    try {
      if (required.some(key => !String(row[key] ?? '').trim())) throw new Error('Missing required value');
      const name = row.name.normalize('NFKC').trim().replace(/\s+/g, ' ');
      if (name.length > 200 || /[<>\x00-\x1f]/.test(name)) throw new Error('Invalid food name');
      const normalizedName = normalizeName(name);
      const servingGrams = quantity(row.serving_grams, 'mass');
      if (servingGrams < 1 || servingGrams > 2000) throw new Error('Serving must be 1–2000 grams');
      const basis = (row.basis || 'per_100g').toLowerCase();
      if (!['per_100g', 'per_serving'].includes(basis)) throw new Error('basis must be per_100g or per_serving');
      const nutrients = {};
      for (const field of ['calories', 'protein', 'carbs', 'fat', 'fiber']) {
        const value = quantity(row[field], field === 'calories' ? 'energy' : 'mass') * (basis === 'per_serving' ? 100 / servingGrams : 1);
        if (!Number.isFinite(value) || value > (field === 'calories' ? 1000 : 100)) throw new Error(`Invalid ${field} per 100 g`);
        nutrients[field] = Math.round(value * 10000) / 10000;
      }
      if (!nutrients.calories || nutrients.fiber > nutrients.carbs || nutrients.protein + nutrients.carbs + nutrients.fat > 105) throw new Error('Inconsistent nutrition values');
      const dietTags = tags(row.diet_tags, DIETS);
      if (dietTags.includes('vegan') && !dietTags.includes('veg')) dietTags.push('veg');
      const allergens = row.allergens.toLowerCase() === 'none' ? [] : tags(row.allergens, ALLERGENS, normalizeAllergen);
      if (dietTags.includes('vegan') && allergens.some(value => ['milk', 'egg', 'fish', 'shellfish'].includes(value))) throw new Error('Vegan classification contradicts allergens');
      if (dietTags.includes('veg') && allergens.some(value => ['fish', 'shellfish'].includes(value))) throw new Error('Vegetarian classification contradicts allergens');
      const category = row.category.trim().toLowerCase();
      if (category.length > 80) throw new Error('Category is too long');
      const food = { name, normalizedName, category, ...nutrients, servingGrams, dietTags, allergens, mealTypes: tags(row.meal_types, MEALS), source };
      if (seen.has(normalizedName)) { duplicates++; return; }
      seen.add(normalizedName); foods.push(food);
    } catch (error) { rejected.push({ row: index + 2, reason: error.message }); }
  });
  return { foods, report: { rows: rows.length, accepted: foods.length, duplicates, rejected } };
}

async function importFoods(csv, source, Food) {
  const { foods, report } = parseFoods(csv, source);
  if (!foods.length) throw new Error('No valid foods found; no database changes made');
  // Validate the entire accepted batch before making any writes.
  for (const food of foods) await new Food(food).validate();
  await Food.createIndexes();
  let upserted = 0, modified = 0;
  for (let offset = 0; offset < foods.length; offset += 500) {
    const result = await Food.bulkWrite(foods.slice(offset, offset + 500).map(food => ({
      updateOne: { filter: { normalizedName: food.normalizedName }, update: { $set: food }, upsert: true },
    })), { ordered: true });
    upserted += result.upsertedCount; modified += result.modifiedCount;
  }
  return { ...report, upserted, modified };
}
module.exports = { quantity, parseFoods, importFoods, normalizeName };
