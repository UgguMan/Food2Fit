# Food2Fit

A MERN application for multimodal recipe generation and dataset-based nutrition and fitness plans.

## Implementation status

**Steps 1–7 implemented, with build checks and the Step 8 deployment guide included.** The frontend includes the landing page, authentication, recipe studio, fitness planner, dashboard, favorites/history, profile and 404 page. A labeled sample preview works without credentials. Live Gemini, Atlas and Vercel verification still require your environment settings; visual browser QA remains pending. See [run and deployment instructions](DEPLOYMENT.md).

1. Project setup, environment configuration and Vercel server skeleton.
2. Models, authentication, validation and persistent rate limiting.
3. CSV food import, exercise seeds and deterministic fitness engine.
4. Gemini text/image recipes, caching, retries and recipe endpoints.
5. React routing, authentication screens and API services.
6. Recipe generator.
7. Fitness planner and dashboard.
8. Integration tests and final deployment guide.

## Requirements

- Node.js 24 LTS and npm (the `.nvmrc` selects Node 24).
- MongoDB Atlas free M0 cluster for a working health check.
- A Gemini API key and a model available under your free-tier quota for Step 4.
- Two Vercel projects when ready to deploy.

There are no paid dependencies or automatic deployments. Free service quotas and account eligibility still apply; do not enable paid Gemini billing or paid infrastructure for this project. Availability and pricing are controlled by the providers, so unlimited zero-cost usage cannot be guaranteed.

## Project structure

```text
food2fit/
  client/
    src/
      pages/ components/ context/ services/ hooks/
      App.jsx main.jsx styles.css
    .env.example
    index.html
    package.json
    package-lock.json
    vite.config.js
    vercel.json
  server/
    api/index.js
    config/env.js
    config/db.js
    models/ controllers/ routes/ services/ middleware/
    scripts/ tests/
    seed/data/
    app.js
    dev.js
    .env.example
    package.json
    package-lock.json
    vercel.json
  package.json
```

Each project has its own dependencies and lockfile, so Vercel can install it independently. Empty feature directories contain `.gitkeep` files until their stage is implemented.

## Local setup (PowerShell)

From the repository root:

```powershell
npm --prefix client ci
npm --prefix server ci
Copy-Item client/.env.example client/.env
Copy-Item server/.env.example server/.env
```

Copy environment files only on first setup; do not overwrite existing credentials. Edit `server/.env` to set `MONGO_URI` to your Atlas URI. Use a dedicated database user scoped to the `food2fit` database. URL-encode special characters in the URI's username/password. Add your local IP to Atlas Network Access for local development.

Generate a random JWT secret for the upcoming authentication stage:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Paste it into `JWT_SECRET` (at least 32 bytes). Authentication returns 503 without a valid secret locally, and production refuses to start with a missing or short secret. Set `GEMINI_API_KEY` and `GEMINI_MODEL` before Step 4; they are not required yet. Never put server secrets in `VITE_` variables: Vite embeds those variables into public browser assets.

Run these commands in separate terminals:

```powershell
npm run dev:server
```

```powershell
npm run dev:client
```

Client: `http://localhost:5173`. Server: `http://localhost:5000`.

```powershell
Invoke-RestMethod http://localhost:5000/api/health
npm run check:server
npm run build
```

The server can start without a database, but API requests correctly return HTTP 503 until MongoDB is configured and reachable. The client setup screen works independently of MongoDB.

## Environment variables

| Project | Variable | Purpose |
| --- | --- | --- |
| Server | `MONGO_URI` | MongoDB connection URI; required for API readiness |
| Server | `JWT_SECRET` | Random signing secret of at least 32 bytes |
| Server | `GEMINI_API_KEY` | Server-only Gemini key for Step 4 |
| Server | `GEMINI_MODEL` | Explicit Gemini model selection for Step 4 |
| Server | `CLIENT_URL` | Exact allowed browser origin, no trailing slash |
| Server | `NODE_ENV` | `development` locally; `production` when deployed |
| Server | `PORT` | Local server port; defaults to 5000 |
| Client | `VITE_API_URL` | Backend origin without `/api` or trailing slash |

## Skeleton API

### GET /api/health

No request body or authentication. Awaits MongoDB connectivity before reporting readiness. Responses are not cached.

HTTP 200:

```json
{ "status": "ok", "service": "food2fit-api", "database": "connected" }
```

HTTP 503 (database missing or unreachable):

```json
{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "Database is temporarily unavailable." } }
```

Missing and unreachable databases return the same public response. Error responses do not expose credentials, database driver details or stack traces. Disallowed browser origins receive HTTP 403. CORS is a browser policy, not an authentication mechanism.

### POST /api/auth/register

Send `Content-Type: application/json`:

```json
{ "name": "Alex", "email": "alex@example.com", "password": "a long unique passphrase" }
```

HTTP 201 (illustrative identifiers and token):

```json
{
  "user": { "id": "507f1f77bcf86cd799439011", "name": "Alex", "email": "alex@example.com", "createdAt": "2026-10-19T08:00:00.000Z" },
  "token": "<signed-jwt>",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

Names are trimmed and limited to 1–80 characters. Email is trimmed and lowercased without provider-specific rewriting. Passwords are preserved exactly, require at least 12 characters, and cannot exceed bcrypt's 72-byte UTF-8 limit. Password hashes use bcrypt cost 12 and are never returned. Extra body fields are rejected. Concurrent duplicate emails are prevented by a unique database index and return HTTP 409.

### POST /api/auth/login

```json
{ "email": "alex@example.com", "password": "a long unique passphrase" }
```

HTTP 200 returns the same session structure as registration. Missing accounts and incorrect passwords return the same HTTP 401 response:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect." } }
```

### GET /api/auth/me

Send `Authorization: Bearer <signed-jwt>`. No request body.

HTTP 200:

```json
{ "user": { "id": "507f1f77bcf86cd799439011", "name": "Alex", "email": "alex@example.com", "createdAt": "2026-10-19T08:00:00.000Z" } }
```

Missing, invalid, expired, or deleted-user sessions return HTTP 401. Tokens last one hour, use only HS256, and verify issuer, audience and subject. Authentication responses use `Cache-Control: no-store`. There is no refresh-token or server logout endpoint; frontend logout will discard the token, which otherwise remains valid until expiry.

### Validation and rate limits

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted fields.",
    "details": [{ "field": "email", "message": "Enter a valid email address." }]
  }
}
```

- HTTP 400: invalid fields, malformed JSON, unsupported body fields.
- HTTP 401: invalid credentials/session.
- HTTP 403: disallowed browser origin.
- HTTP 409: duplicate record.
- HTTP 413: oversized request.
- HTTP 415: authentication POST without JSON content type.
- HTTP 429: exhausted rate limit, with `Retry-After` and standard rate-limit headers.
- HTTP 503: database, auth configuration or rate-limit storage unavailable.

Registration and login share a limit of **20 requests per IP per 15-minute fixed window**, including invalid attempts. MongoDB counters use atomic increments and hashed keys; no rate-limit state is held in application memory. IPv6 addresses use express-rate-limit's subnet grouping. The quota resets based on the bucket timestamp even if MongoDB TTL cleanup is delayed. Store failures deny requests rather than bypassing limits.

The AI middleware is ready for Step 4: **5 requests per minute per user and per IP**, both applied after authentication. It is not yet attached to any recipe endpoint. Vercel deployments trust one proxy hop; local development trusts none. This relies on [Vercel's documented forwarding behavior](https://vercel.com/docs/headers/request-headers); adding another proxy requires reviewing that assumption.

Remaining endpoints and examples will be added with their implementations. No placeholder endpoints claim success.

## Models and indexes

All ten requested models are defined, plus the internal `RateLimit` counter collection:

| Model | Key decisions |
| --- | --- |
| `User` | Unique normalized email; password hash excluded from queries and JSON |
| `Profile` | One per user; height in cm, weight in kg; adults 18–100 |
| `Recipe` | Per-user history with 30-day expiration |
| `SavedRecipe` | Unique user/recipe pair; full snapshot, no TTL |
| `RecipeCache` | Unique SHA-256 key; 30-day expiration |
| `Food` | Unique normalized food name; nutrients per 100 g; diet/allergen tags |
| `Exercise` | Unique name; equipment, movement, difficulty and goal tags |
| `MealPlan` | Seven days, four meals each; food references and nutrition snapshots |
| `WorkoutPlan` | References its meal plan; exercise references, sets, reps and rest |
| `ProgressLog` | One weight record per user/date |
| `RateLimit` | Unique counter bucket; expiry index |

Profile `gender` currently represents the male/female coefficient used by the requested Mifflin–St Jeor calculation; the planner UI will explain this when implemented. Nutrition values are estimates. Model constraints are a second layer behind endpoint validation; future endpoints will add their own input checks.

MongoDB TTL deletion is asynchronous. Recipe/cache routes in Step 4 must also filter `expiresAt` when reading. Favorites remain available after their history records expire.

Local development creates indexes after connecting. In **production, run the following once before serving traffic**, and again when adding indexes:

```powershell
npm --prefix server run db:indexes
```

Run with `MONGO_URI` pointing to the target database. This adds indexes without dropping data or existing indexes. It fails if existing duplicates prevent a unique index. Production automatic index building is disabled to avoid work on every serverless cold start. Do not skip this setup: uniqueness and expiry depend on these indexes.

## Backend verification

```powershell
npm --prefix server test
npm run check:server
```

Tests use `supertest` and a real, temporary MongoDB process managed by `mongodb-memory-server`. They never connect to Atlas or use your configured database. The first installation/run may download a MongoDB binary and needs network access; execution needs permission for local processes and loopback connections. These packages are development-only dependencies.

The suite covers registration, bcrypt hashing, concurrent duplicate registration, login failures, hostile inputs, JWT expiry/audience/algorithm checks, deleted-user sessions, shared concurrent rate counters, quota exhaustion, storage failure, expiry indexes, favorite persistence, security headers and schema validation.

Step 3 also tests CSV normalization and idempotent imports, nutrition arithmetic, diet/allergy filtering, weekly variety, equipment-compatible workouts, user isolation, progress updates and transactional plan persistence/rollback. The fitness tests use a temporary MongoDB replica set and never call Gemini.

## Seed data and fitness planning

The supplied **50-food sample CSV is illustrative, not Protein Nap**, as agreed for this stage. There are also 24 exercise records. Configure your MongoDB connection, then run:

```powershell
npm --prefix server run seed:foods -- --sample
npm --prefix server run seed:exercises
```

See the [CSV contract and import instructions](server/seed/data/README.md) for units, required metadata, cleaning and importing the real dataset later. See the [fitness API and calculation policy](server/FITNESS_API.md) for every new endpoint, examples, formulas, selection constraints and limitations. Plan generation requires a replica set (including Atlas) for atomic saves.

The engine has no AI dependency. It saves seven meal days plus a weekly workout schedule, shows actual nutrition alongside targets, and reports shortfalls rather than hiding them. The latest complete plan pair replaces the previous one. Editing a profile marks its old plan stale until regenerated.

## Gemini recipes

See the [recipe API guide](server/RECIPES_API.md) for request/response examples, upload limits, caching, retries, saved-recipe fallback and credential setup. Only the backend calls Gemini; `GEMINI_MODEL` must be explicitly configured. Photos remain in memory and are resized/stripped of metadata before inline submission.

Automated recipe tests mock the provider and use temporary MongoDB, so they require no API key or Atlas account. Live recipe quality and model access remain unverified until `server/.env` is configured. The browser image-preparation helper is ready for the Step 6 page; that interaction has not yet been browser-tested.

## Vercel configuration

The following prepares deployment of the skeleton; the full application is not implemented yet.

1. Push this repository to your Git provider.
2. Create the **server** Vercel project with Root Directory `server`, Node.js 24, and the supplied `vercel.json`. Use the API function setup (Other preset if selecting manually), with no custom build command or static output directory. `api/index.js` exports Express; only local `dev.js` opens a listening socket. Set the server environment variables in Vercel, including `NODE_ENV=production` and the final HTTPS client origin in `CLIENT_URL`.
3. Create the **client** project from the same repository with Root Directory `client`, the Vite preset, build command `npm run build`, and output directory `dist`. Set `VITE_API_URL` to the deployed server origin. Client rewrites support future React Router deep links.
4. Set the final client origin in the server project and redeploy if it changed. Preview deployments are not automatically allowed by CORS; use a separately configured preview backend/client pair when necessary.
5. Atlas connections from Vercel require a suitable network access rule. For the requested free-tier setup, add `0.0.0.0/0` and retain strong database credentials with minimal privileges. Run `npm --prefix server run db:indexes` against this database before exposing authentication endpoints.
6. Verify the deployed server's `/api/health` returns 200 before integrating features.

The function duration is set to 60 seconds. MongoDB uses `global._mongoose` to reuse a connection and share pending connection attempts, with a small pool and bounded connection timeout. No user data, rate counters, recipes or plans are stored in process memory. Models, TTL indexes and shared MongoDB rate limits are implemented. JSON bodies are capped at 1 MB; multipart image limits will be implemented alongside image handling.

References: [Vercel Express documentation](https://vercel.com/docs/frameworks/backend/express), [Google GenAI SDK documentation](https://ai.google.dev/gemini-api/docs/libraries). The server dependency uses the current official `@google/genai` SDK.

## Dataset and screenshots

The Protein Nap CSV and its actual column definitions were not supplied. Step 3 includes explicitly labeled sample data. Adapt and import the real dataset using the documented CSV contract when it becomes available.

- Landing screenshot: pending Step 5.
- Recipe generator screenshot: pending Step 6.
- Fitness dashboard screenshot: pending Step 7.
