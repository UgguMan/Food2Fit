# Food and exercise data

`sample-foods.csv` contains **50 illustrative foods**, using approximate nutrition values for development. It is authored sample data, **not the Protein Nap dataset**, not an authoritative food-composition database, and not verified for clinical use. The deliberately broad meal classifications exercise the planner; generated combinations are food portions rather than finished recipes. The displayed food name states the preparation basis where relevant.

`exercises.json` contains 24 beginner exercise records. `none` needs no exercise equipment; `home` assumes dumbbells or resistance bands; `gym` adds machines/cables. The engine also includes lower-equipment options when home/gym is selected. Goal tags determine eligibility; the engine adds sets, repetitions, rest and scheduling.

## CSV contract

The actual Protein Nap file/schema has not been supplied. Adapt its columns into this format before import. Do not invent missing diet/allergen metadata.

| Column | Required | Format |
| --- | --- | --- |
| `name` | Yes | Food name, including cooked/raw preparation state |
| `category` | Yes | Text category, maximum 80 characters |
| `calories` | Yes | Nonnegative kcal, optionally with `kcal` or `kJ` suffix |
| `protein`, `carbs`, `fat`, `fiber` | Yes | Nonnegative grams, optionally `g`, `mg` or `kg` suffix |
| `serving_grams` | Yes | Typical portion mass, 1–2000 g after conversion |
| `diet_tags` | Yes | Semicolon/pipe-separated `vegan`, `veg`, `non-veg`, `keto` |
| `allergens` | Yes | Supported tags separated by semicolon/pipe, or explicit `none` |
| `meal_types` | Yes | Semicolon/pipe-separated `breakfast`, `lunch`, `snack`, `dinner` |
| `basis` | No | `per_100g` (default) or `per_serving` |

Example:

```csv
name,category,calories,protein,carbs,fat,fiber,serving_grams,diet_tags,allergens,meal_types,basis
Example bean portion,legume,200 kcal,12 g,30 g,4 g,8 g,200 g,vegan,none,lunch;dinner,per_serving
```

The example becomes 100 kcal, 6 g protein, 15 g carbs, 2 g fat and 4 g fiber per 100 g. Units without suffixes use kcal for energy and grams for mass. Decimal points are supported; decimal commas, thousands separators, percentages and uncertain values such as `<1` are rejected rather than guessed.

Supported allergen tags: `milk`, `egg`, `fish`, `shellfish`, `peanut`, `tree-nut`, `soy`, `wheat`, `gluten`, `sesame`, `mustard`, `celery`, `lupin`, `sulfite`. Common aliases such as dairy/soya/eggs are normalized. `nuts` is mapped to tree nuts; peanuts must be selected separately. Unknown allergens and missing metadata are rejected. `none` describes supplied ingredient metadata, not guaranteed absence of cross-contact. Verify real labels and preparation conditions.

`vegan` automatically includes `veg`. Vegetarian here excludes eggs, fish and meat. `non-veg` in the profile is an unrestricted diet and can select vegan/vegetarian foods too. `keto` means the dataset marks the food as a low-carbohydrate candidate; the engine separately evaluates the total carbohydrate target. No ketosis guarantee is made.

## Cleaning and repeat imports

- UTF-8 BOM and header whitespace/case are normalized.
- Names use Unicode normalization, trimmed/collapsed spaces and a lowercase deduplication key.
- Rows with missing/invalid fields are skipped and reported with CSV row numbers and reasons.
- Negative/nonfinite nutrients, implausible per-100-g values and inconsistent vegan/allergen tags are rejected.
- The first valid occurrence of a normalized name wins within a file.
- Accepted rows are validated against the Mongoose model before writes.
- Imports upsert by normalized name, so repeating an import does not create duplicates. Later imports of the same food update its values and source label.
- No existing food collection is cleared. Batches of 500 writes are not a single transaction: a mid-import database error can leave earlier batches imported; rerun the same file to resume safely.
- Limits: 10 MB per file, 50,000 CSV records, 16 KB per CSV record. Plan generation currently supports up to 2,000 foods for the selected diet; use a curated subset for larger source datasets.

From the repository root, after configuring MongoDB:

```powershell
npm --prefix server run seed:foods -- --sample
npm --prefix server run seed:exercises
```

To import your normalized dataset with an explicit provenance label:

```powershell
npm --prefix server run seed:foods -- "C:\data\protein-nap-normalized.csv" "Protein Nap - verified export"
```

Only use that label for the actual dataset. There is no automatic download or silent replacement of sample data.
