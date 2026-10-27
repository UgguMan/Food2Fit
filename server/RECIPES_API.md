# Recipe API (Step 4)

All routes require `Authorization: Bearer <token>`. All JSON POST requests use `Content-Type: application/json`. Unknown fields are rejected. User ownership comes from the verified session, never a supplied user ID. Responses are not browser/CDN cached.

## Configuration and verification

Save these in `server/.env` locally, and in the **server** project's environment variables on Vercel:

```dotenv
GEMINI_API_KEY=your_private_key
GEMINI_MODEL=your_available_model
```

Choose a model with text, image and structured-output support under your account's free quota. There is no hardcoded model or automatic paid fallback. The server also needs `MONGO_URI` and `JWT_SECRET` for authentication/storage. Never put these values in the client environment or commit `.env`.

The backend uses the official `@google/genai` SDK. See [structured output configuration](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html) and [inline image input](https://ai.google.dev/gemini-api/docs/image-understanding).

Automated tests use real temporary MongoDB databases and **mocked Gemini responses**. They exercise the application's integration boundaries without spending quota. They do not verify model availability, actual generated-recipe quality, your credentials, Atlas connectivity or a Vercel deployment. A live authenticated generation and image request are still needed once credentials are configured.

## Generate

`POST /api/recipes/generate`:

```json
{
  "ingredients": ["chickpeas", "spinach"],
  "cuisine": "Indian",
  "dietType": "vegan",
  "allergies": ["milk"],
  "calorieTarget": 350,
  "cookingTime": 30,
  "servings": 2,
  "regenerate": false
}
```

Required fields: 1–40 ingredient strings (100 characters each), cuisine (80 characters), diet type (`veg`, `non-veg`, `vegan`, `keto`), allergy array (0–30 strings of 80 characters), integer calorie target (100–3000 kcal per serving), cooking time (5–240 minutes), and servings (1–20). `regenerate` is an optional JSON boolean; true bypasses the cache. Do not include names, contact details, medical histories or other sensitive information in these food-preference fields.

HTTP 201, including for a cache hit:

```json
{
  "recipe": {
    "_id": "507f1f77bcf86cd799439013",
    "user": "507f1f77bcf86cd799439011",
    "recipe": {
      "title": "Chickpea bowl",
      "description": "A simple chickpea and vegetable bowl.",
      "ingredients": [{ "name": "chickpeas", "quantity": "300 g" }, { "name": "spinach", "quantity": "100 g" }],
      "instructions": ["Cook the chickpeas until tender.", "Add spinach and heat until cooked."],
      "prepTime": 5,
      "cookTime": 15,
      "servings": 2,
      "nutrition": { "calories": 350, "protein": 18, "carbs": 50, "fat": 9, "fiber": 12 }
    },
    "preferences": {
      "ingredients": ["chickpeas", "spinach"], "cuisine": "indian", "dietType": "vegan",
      "allergies": ["milk"], "calorieTarget": 350, "cookingTime": 30, "servings": 2
    },
    "expiresAt": "2026-11-18T08:00:00.000Z",
    "createdAt": "2026-10-19T08:00:00.000Z",
    "updatedAt": "2026-10-19T08:00:00.000Z",
    "__v": 0
  },
  "cached": false,
  "nutritionBasis": "per-serving",
  "notice": "AI nutrition is estimated. Verify ingredients and allergen labels before cooking."
}
```

This is a response-shape example using a test recipe, not a verified nutrition calculation. `recipe._id` is the history ID used by save/refine/delete; `recipe.recipe` contains the generated content. Amounts describe the whole recipe; nutrition is per serving. Times are minutes. Dietary suitability, calorie accuracy and allergen absence cannot be established by JSON validation alone; the UI must preserve the notice.

## Refine

`POST /api/recipes/refine`:

```json
{ "recipeId": "507f1f77bcf86cd799439013", "refinement": "higher-protein", "regenerate": false }
```

Refinement is either `healthier` or `higher-protein`. Returns HTTP 201 with the same structure as generation and a **new** history ID. The original recipe is unchanged. Stored ingredient/diet/allergy/serving preferences are retained; they cannot be overridden through this endpoint. Saved snapshots can be refined even after history expires, using their original `recipeId`. Older records without stored preferences return HTTP 422 `RECIPE_PREFERENCES_MISSING`.

## Detect ingredients

`POST /api/recipes/detect-ingredients` accepts multipart form data with one file named `image` and no text fields. JPEG, PNG and WebP only; maximum 2 MB and 16 megapixels; animation is rejected. Do not manually set a multipart boundary when using browser `FormData`.

```javascript
const form = new FormData();
form.append('image', preparedImageFile);
// Send form to the backend with the authenticated Authorization header.
```

HTTP 200:

```json
{
  "ingredients": ["chickpeas", "spinach"],
  "requiresConfirmation": true,
  "notice": "Review and edit these suggestions before generating. A photo cannot reveal every ingredient or allergen."
}
```

No recognizable food returns an empty array. Detection **does not automatically generate a recipe**. The Step 6 UI will let users edit the list and submit it through `/generate`.

The supplied client helper `prepareIngredientImage` re-encodes accepted browser images as JPEG with a maximum dimension of 1024 pixels and removes metadata. The server independently decodes and checks the file, resizes to 1024 pixels, strips metadata, and sends inline base64 to Gemini. Files are held only in request memory, never written to disk/MongoDB or the Gemini Files API. Detection results are not cached. Visual content still goes to Google, so users should crop out faces, documents and personal details. Metadata stripping does not remove personal details visible in pixels. Browser-helper interaction testing belongs to the recipe UI stage.

## Favorites and history

`POST /api/recipes/save`:

```json
{ "recipeId": "507f1f77bcf86cd799439013" }
```

HTTP 200 (content abbreviated):

```json
{ "savedRecipe": { "_id": "507f1f77bcf86cd799439014", "recipeId": "507f1f77bcf86cd799439013", "recipe": { "title": "Chickpea bowl" } } }
```

The actual saved record contains the full recipe, preferences, owner and timestamps. Saving again is idempotent; no duplicate favorite is created. A favorite snapshot has no TTL and survives deletion/expiry of its source history record.

`GET /api/recipes/history?page=1&limit=20` lists unexpired history. `GET /api/recipes/favorites?page=1&limit=20` lists saved snapshots. Both return HTTP 200:

```json
{ "recipes": [], "page": 1, "limit": 20, "hasMore": false }
```

Nonempty arrays contain complete history or saved records as above, newest first. Defaults are page 1 and limit 20; page maximum is 1000, limit maximum is 50. Expired records are excluded even before MongoDB's TTL cleanup runs.

`DELETE /api/recipes/:id` removes an owned **history** record and returns HTTP 204 with no body. It leaves favorites and cache entries intact. `DELETE /api/recipes/favorites/:id` removes the owned **saved record**, using its saved `_id`, and returns HTTP 204. Both return 404 for absent/other-user records and 400 for malformed IDs. These are separate actions so deleting history does not unexpectedly discard favorites.

## Quotas, cache and errors

Generation, refinement and image detection share MongoDB-backed limits of **5 requests per minute per user and per IP**. Cache hits and invalid submissions also count. Reading/saving/deleting recipes does not consume the AI-route quota. Application rate-limit responses include `Retry-After`.

Cache keys hash the normalized preferences, user ID, configured model, prompt version, and (for refinement) source recipe plus refinement choice. Caches are private to the user and expire after 30 days. The cache stores generated recipes, not images or raw prompts. Every successful request creates a new 30-day history entry. Regeneration replaces the cache result. Concurrent identical cache misses may each call Gemini; there is no distributed generation lock.

Provider 429/`RESOURCE_EXHAUSTED` errors receive at most two retries, after 500 ms and 1000 ms. SDK automatic retries are disabled to prevent stacked retry loops. Each attempt has a 12-second timeout with an abort signal; timeouts, safety blocks and malformed responses are not retried. This bounds AI waiting to about 37.5 seconds when all three quota attempts run for the full timeout. Google can report minute or daily quota exhaustion, so the application does not promise an exact reset time.

JSON-only output is requested with a schema. The server strips a single optional code fence, parses in try/catch, and rejects missing/extra fields, wrong types, invalid sizes, negative/nonfinite nutrition, HTML-like output and wrong serving counts before storage. Cached values are also checked before use.

Example exhausted-quota response, HTTP 429:

```json
{
  "error": {
    "code": "AI_QUOTA_EXCEEDED",
    "message": "The AI limit has been reached. Please try again later, or use a saved recipe.",
    "details": { "savedRecipes": [] }
  }
}
```

`savedRecipes` contains up to five of the caller's recent favorite snapshots, or an empty array. Fallback recipes are also included for other AI failures and local AI-route throttling when MongoDB is available. They are suggestions from prior saves, not a successful generation response.

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR`, `IMAGE_REQUIRED`, `INVALID_IMAGE`, `INVALID_UPLOAD` | Correct fields or image |
| 401 | `UNAUTHORIZED` | Sign in |
| 404 | `RECIPE_NOT_FOUND` | Missing or inaccessible owned record |
| 413 | `PAYLOAD_TOO_LARGE` | Upload/body exceeds limit |
| 415 | `JSON_REQUIRED`, `INVALID_IMAGE` | Unsupported request/file type |
| 422 | `AI_SAFETY_BLOCK` | Provider blocked the request |
| 429 | `RATE_LIMITED`, `AI_QUOTA_EXCEEDED` | Application or provider quota exhausted |
| 502 | `AI_INVALID_RESPONSE` | Invalid, truncated or mismatched generated output |
| 503 | `AI_NOT_CONFIGURED`, `AI_UNAVAILABLE` | Missing configuration or unavailable provider |
| 504 | `AI_TIMEOUT` | Attempt exceeded its time limit |

Only explicit recipe preferences and the optional source recipe/image are sent to Gemini. Account names, email, JWTs, fitness profiles and progress logs are never read into these prompts. Do not place sensitive data into the free-text food fields; free-tier provider data handling still applies. Provider errors, keys and raw responses are not logged or returned to users.
