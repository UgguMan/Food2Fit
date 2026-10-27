const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, 'very-active': 1.9 };
const GOALS = ['fat-loss', 'muscle-gain', 'maintenance'];
const DIETS = ['veg', 'non-veg', 'vegan', 'keto'];
const ALLERGENS = ['milk', 'egg', 'fish', 'shellfish', 'peanut', 'tree-nut', 'soy', 'wheat', 'gluten', 'sesame', 'mustard', 'celery', 'lupin', 'sulfite'];
const ALIASES = { dairy: 'milk', eggs: 'egg', peanuts: 'peanut', nuts: 'tree-nut', 'tree nuts': 'tree-nut', 'tree nut': 'tree-nut', soybeans: 'soy', soya: 'soy', sulphites: 'sulfite', sulfites: 'sulfite', crustaceans: 'shellfish', molluscs: 'shellfish' };
const normalizeAllergen = value => ALIASES[value.trim().toLowerCase()] || value.trim().toLowerCase();
const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
const NUTRIENTS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
module.exports = { ACTIVITY, GOALS, DIETS, ALLERGENS, normalizeAllergen, MEALS, NUTRIENTS };
