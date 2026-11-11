# Quality Inspection: AI-assisted defect classification

A Quality Engineer photographs a unit, a vision model suggests what is wrong with it, and the engineer
accepts or overrides that suggestion before anything is recorded. Overrides are stored as queryable data.

**Stack:** React (Vite) · Node.js (Express 5) · PostgreSQL · Google Gemini vision API

## Setup

Requirements: Node 20+ (developed on 22), Docker (or any PostgreSQL 14+).

```bash
# 1. Install everything (this also installs the git pre-commit hook via Husky)
npm install
npm --prefix backend install
npm --prefix frontend install

# 2. Start Postgres and configure the backend
docker compose up -d
cp backend/.env.example backend/.env
#    -> put your free Gemini key in backend/.env as GEMINI_API_KEY=...
#       (create one at https://aistudio.google.com/apikey)

# 3. Create tables and seed two users and two batches
npm run db:setup

# 4. Run the API (port 4000) and the web app (port 5173), in two terminals
npm --prefix backend run dev
npm --prefix frontend run dev
```

Open http://localhost:5173. Use the "Acting as" picker to switch between **Priya Singh** (Quality
Engineer) and **Arjun Mehta** (Production Supervisor).

Run the tests with one command: `npm test`

## Vision model

**Google Gemini (`gemini-2.5-flash` by default)**, configurable with `GEMINI_MODEL`. I chose it because it is
vision-capable, fast, and has a free tier that needs only an API key from Google AI Studio, which is plenty
for testing a handful of photos. Gemini's structured output (`responseMimeType` + `responseSchema`) lets me
constrain the answer to the fixed taxonomy. The API is called directly with `fetch`, so there is no
provider SDK to install.

**Cost:** nothing, on the free tier. Free-tier limits and available model names change over time, so check
AI Studio if a call is rejected with `429` or `404`; setting `GEMINI_MODEL` to another current Flash model
is usually enough. I have not run the app against the live API myself.

## How the flow works

1. `POST /api/classify` (engineers only) saves the photo, calls the model, and stores the call in
   `ai_predictions`. It returns a `predictionId`, the validated prediction and the confidence. Transient errors
   (429/5xx) are retried twice with a short backoff, and each call has a timeout (`AI_TIMEOUT_MS`). No
   inspection exists yet.
2. The UI shows the AI's answer next to "Your call". The engineer accepts or picks another type and may
   add comments.
3. `POST /api/inspections` (engineers only) takes `{ batchId, predictionId, finalDefectType, comments }`.
   The server looks up the stored AI answer and **derives `was_overridden` itself**, so the client cannot
   misreport it. The inspection row keeps `ai_predicted_defect_type`, `ai_confidence` and
   `final_defect_type` side by side.

## Architecture notes

- **Layers:** `app.js` (HTTP) → `inspectionService.js` / `kpi.js` / `taxonomy.js` (pure logic) →
  `repo.js` (all SQL). `aiClassifier.js` is the only code that talks to the model, and takes an
  injectable client so tests never hit the network.
- **Inspection vs. AI call:** separate tables. `ai_predictions` records every model call (including raw
  response, status, errors). `inspections` references one prediction (unique, so a photo is logged once).
- **Constraining model output:** Gemini is asked for JSON matching a schema that enumerates the five
  allowed values, then the response is validated again server-side (`normalizeOutcome`,
  `normalizeConfidence`). Free text, unsupported categories or malformed output become status `unusable`.
  The database also has `CHECK` constraints on every defect column.
- **AI failure never blocks the engineer:** if the call times out, errors, or returns unusable output,
  the prediction is stored with status `failed`/`unusable` and the UI asks the engineer to choose manually.
  Those inspections have no AI answer, `was_overridden = false`, and are excluded from the acceptance rate.
- **Authorization:** the `X-User-Id` header names a seeded user. `requireRole` runs before upload parsing
  or the AI call, so a Production Supervisor gets `403` and no model cost. Verify:

  ```bash
  curl -i -X POST localhost:4000/api/classify -H 'X-User-Id: 2'   # 403
  curl -i localhost:4000/api/inspections -H 'X-User-Id: 2'        # 200
  ```

- **KPIs** (`kpi.js`, aggregated in SQL by `repo.getKpiCounts`):
  - Defect rate = rejected ÷ total inspected.
  - AI acceptance rate = inspections with an AI answer and `was_overridden = false` ÷ inspections with an AI answer.
  - Rates are `null` (shown as "—") when the denominator is zero, never `0%` or `NaN`.

## Pre-commit checks

Husky runs `.husky/pre-commit` before every commit:

1. `lint-staged`: ESLint (`--fix`) and Prettier on staged files
2. `npm test`: the backend unit test suite
3. `npm run audit:all`: `npm audit --audit-level=high` for the root, backend and frontend packages

Verify it is active: `git config core.hooksPath` should print `.husky/_`, and committing a file with a lint
error (or an unused variable) should be blocked. Run the same checks manually with `npm run lint`,
`npm run format:check`, `npm test` and `npm run audit:all`. Husky installs the hook in the `prepare` step of
`npm install`, so it needs the project to be a git repository first (`git init`).

## Known limitations

- I could not run the app against a live PostgreSQL or the live Gemini API in my build environment.
  The unit tests, lint, formatting and the production build pass, but the SQL in `repo.js` and the model
  call have not been exercised end to end. Please do a first smoke test with a couple of photos.
- Identity is a header, as the brief allows. This is not real authentication.
- Uploaded images are stored on local disk (`backend/uploads`); production would use object storage.
- No automated tests for the React components or the SQL queries (an integration test against a throwaway
  Postgres would be the next addition).
- Prediction rows from photos that are never logged remain in `ai_predictions` (useful for auditing).
- No pagination on the inspection list.
