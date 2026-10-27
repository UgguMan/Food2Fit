# Fitness engine and API

All endpoints below require `Authorization: Bearer <token>`. Responses use `Cache-Control: no-store`; ownership always comes from the verified token. Supplying `user` in a body/query is rejected. Numeric profile values must be JSON numbers, not numeric strings.

## Profile endpoints

`POST /api/fitness/profile` creates a profile (201). `PUT /api/fitness/profile` replaces all profile fields (200); it does not create a missing profile. Both accept the same JSON body:

```json
{
  "age": 30,
  "gender": "male",
  "height": 175,
  "weight": 75,
  "activityLevel": "moderate",
  "goal": "maintenance",
  "dietPreference": "vegan",
  "allergies": ["peanut"],
  "workoutDays": 3,
  "equipment": "none"
}
```

Example response from either endpoint:

```json
{
  "profile": {
    "_id": "507f1f77bcf86cd799439012",
    "user": "507f1f77bcf86cd799439011",
    "age": 30,
    "gender": "male",
    "height": 175,
    "weight": 75,
    "activityLevel": "moderate",
    "goal": "maintenance",
    "dietPreference": "vegan",
    "allergies": ["peanut"],
    "workoutDays": 3,
    "equipment": "none",
    "createdAt": "2026-10-19T08:00:00.000Z",
    "updatedAt": "2026-10-19T08:00:00.000Z",
    "__v": 0
  }
}
```

`GET /api/fitness/profile` has no body/query and returns the same profile wrapper (200), or `PROFILE_NOT_FOUND` (404). `DELETE /api/fitness/profile` has no body/query and returns 204 with no response body; it atomically deletes the profile and its generated plans. Weight logs remain independent history. Duplicate profile creation returns 409.

Allowed profile values:

- Age: integer 18–100; height: 100–250 cm; weight: 30–350 kg.
- `gender`: `male` or `female`, currently the equation coefficient rather than a comprehensive gender-identity field.
- `activityLevel`: `sedentary`, `light`, `moderate`, `active`, `very-active`.
- `goal`: `fat-loss`, `muscle-gain`, `maintenance`.
- `dietPreference`: `veg`, `non-veg`, `vegan`, `keto`.
- `allergies`: supported dataset tags, or `[]`; see [dataset contract](seed/data/README.md).
- `workoutDays`: integer 1–7; `equipment`: `none`, `home`, `gym`.

## Generate and retrieve a plan

`POST /api/fitness/generate-plan` takes no body (an empty JSON object is also accepted). It reads the saved profile and seeded foods/exercises. Rate limit: 5 generations per user per minute, stored in MongoDB. Success is HTTP 201.

`GET /api/fitness/plan` takes no body/query and returns HTTP 200 with the same structure. `stale` becomes true after a profile edit, until regeneration. The latest complete pair replaces the prior pair; no unbounded plan history accumulates.

Response structure (day arrays are abbreviated here; the real response contains all seven meal days and all requested workout days):

```json
{
  "mealPlan": {
    "_id": "507f1f77bcf86cd799439013",
    "user": "507f1f77bcf86cd799439011",
    "metrics": { "bmi": 24.5, "bmr": 1698.8, "tdee": 2633.1 },
    "targets": { "calories": 2633, "protein": 90, "carbs": 370.8, "fat": 87.8, "fiber": 36.9 },
    "days": [
      {
        "day": 1,
        "meals": [
          {
            "type": "breakfast",
            "foods": [
              { "food": "507f1f77bcf86cd799439020", "name": "Cooked lentils", "grams": 150,
                "nutrition": { "calories": 174, "protein": 13.5, "carbs": 30, "fat": 0.6, "fiber": 12 } }
            ],
            "totals": { "calories": 174, "protein": 13.5, "carbs": 30, "fat": 0.6, "fiber": 12 }
          }
        ],
        "totals": { "calories": 2500, "protein": 95, "carbs": 350, "fat": 80, "fiber": 38 },
        "deviation": { "calories": -5.1, "protein": 5.6, "carbs": -5.6, "fat": -8.9, "fiber": 3 }
      }
    ],
    "sources": ["Food2Fit illustrative sample (not Protein Nap)"],
    "algorithmVersion": "1.0",
    "profileUpdatedAt": "2026-10-19T08:00:00.000Z",
    "warnings": [],
    "notes": ["Food amounts use the preparation state named in the dataset. Targets and actual totals are shown separately."]
  },
  "workoutPlan": {
    "mealPlan": "507f1f77bcf86cd799439013",
    "days": [
      { "day": 1, "title": "Full body", "exercises": [
        { "exercise": "507f1f77bcf86cd799439030", "name": "Wall push-up", "sets": 2, "reps": "10–15", "restSeconds": 60 }
      ] }
    ],
    "restDays": [2, 4, 6, 7],
    "notes": ["Start with 5 minutes of easy movement. Use controlled, pain-free motion and a load you can manage."]
  },
  "stale": false
}
```

The excerpt illustrates the response fields, not a complete or recommended day's intake. Actual totals are calculated from every selected food portion. Database identifiers/timestamps differ on each save.

Example failure, HTTP 422:

```json
{ "error": { "code": "INSUFFICIENT_FOODS", "message": "Not enough eligible foods for breakfast on day 1. Add foods matching your diet/allergies and meal types; limits were not relaxed." } }
```

Other failures: missing profile/plan (404), insufficient exercises (422), fat-loss goal with BMI below 18.5 (`GOAL_REQUIRES_REVIEW`, 422), more than 2,000 diet-matching foods (`DATASET_TOO_LARGE`, 422), rate limit (429), database/storage failure (503/500). No Gemini call is made. Failed generation does not overwrite an existing complete pair.

MongoDB transactions require Atlas or a replica set. A standalone local MongoDB server is not sufficient for plan saves/profile deletion. The tests start a temporary replica set automatically.

## Weight progress

`POST /api/fitness/log-progress`:

```json
{ "date": "2026-10-19", "weight": 74.5, "notes": "Morning measurement" }
```

HTTP 200:

```json
{ "progress": { "_id": "507f1f77bcf86cd799439040", "user": "507f1f77bcf86cd799439011", "date": "2026-10-19", "weight": 74.5, "notes": "Morning measurement" } }
```

Actual records also include creation/update timestamps. Reposting the same date updates its weight/notes. Dates must be real `YYYY-MM-DD` dates from 2000 through today, with one day of tolerance for timezone differences. Weight uses kg (30–350); optional notes are capped at 500 characters.

`GET /api/fitness/progress?limit=90` returns the latest 90 entries in chronological order (default 90, maximum 365):

```json
{ "progress": [ { "date": "2026-10-19", "weight": 74.5, "notes": "Morning measurement", "user": "507f1f77bcf86cd799439011", "_id": "507f1f77bcf86cd799439040" } ] }
```

No records returns `{ "progress": [] }`. Invalid dates, values and unsupported fields/query parameters return HTTP 400. Logging a weight does not silently change the profile or regenerate its plan.

## Deterministic calculation policy

The service is pure Node.js: given the same profile and data, it produces the same output. BMI is kg/m². Estimated resting energy uses `10 × kg + 6.25 × cm − 5 × age + coefficient`, where the coefficient is +5 or −161. This is based on the [original Mifflin–St Jeor paper](https://pubmed.ncbi.nlm.nih.gov/2305711/).

The following are explicit application heuristics, not claims of individualized medical accuracy:

- Activity factors: 1.2, 1.375, 1.55, 1.725, 1.9 in listed activity order.
- Fat loss: subtract the smaller of 400 kcal or 15% of TDEE. Muscle gain: add 250 kcal. Maintenance: use TDEE.
- Calorie bounds: minimum 1500 for the male equation or 1200 for the female equation; maximum 4500. Bounding emits a warning.
- Protein: 1.2 g/kg for maintenance, 1.6 g/kg for other goals, capped at 35% of energy. These settings fall within the range discussed in [ACSM's protein information sheet](https://www.acsm.org/docs/default-source/files-for-resource-library/protein-intake-for-optimal-muscle-maintenance.pdf); special clinical needs are outside this planner.
- Standard diets: fat gets 30% of energy; carbohydrate gets the remainder. Keto: carbohydrate is capped at the smaller of 50 g or 8% of energy, with fat taking the remainder. Total carbohydrate is used, not net carbohydrate.
- Fiber target: 14 g per 1000 kcal. Gram targets are rounded to one decimal place.

Food selection filters diet/allergen/meal tags first. Unknown allergen metadata is ineligible; wheat/gluten restrictions are conservatively cross-filtered. Each meal searches up to three foods and portions from half to twice the recorded serving (maximum 600 g per item), ranking normalized calorie/macro distance and repetition penalties. Search keeps eight candidates per round from up to 160 portion candidates. It is a bounded heuristic, not an exact optimizer.

Breakfast/lunch/snack/dinner receive 25%/30%/15%/30% of the target. A food cannot appear twice in one day or more than four times in the week. If eligibility/variety leaves no candidates, generation fails rather than relaxing restrictions. Calorie differences over 15% or protein differences over 25% generate per-day warnings. Low-carb overshoots also generate warnings. **The limited sample data can produce substantial deviations, particularly for keto; the dashboard must show actual totals and warnings, not claim target compliance.**

Workout selection uses seeded records, equipment availability, goal tags and beginner/intermediate difficulty. Up to three days use spaced full-body sessions; four or more use push/pull/legs rotations. Fat-loss schedules may include low-impact intervals. Six/seven-day schedules include active recovery; rest days are explicit. Sets/reps/rest vary by goal. No advanced or all-out HIIT is prescribed without a fitness-experience input.
