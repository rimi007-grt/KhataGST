\# PROJECT\_SPEC: KhataGST



\## ROLE

You are a senior full-stack engineer building a hackathon MVP in 3 hours. Build exactly what is specified below. Do not add features that are not listed. Prefer simple, working, testable code over clever code. Work in the build order given, and make each step run before starting the next.



\## PRODUCT: KhataGST

One line: a micro-business owner uploads a photo of a paper register or receipt, the system extracts structured entries, a deterministic rules engine validates them against GST rules and explains every error in plain English and Hindi, and the owner exports a GST-ready summary file.



\## USERS

Registered micro-traders and service providers under one of three schemes: REGULAR (monthly), QRMP (quarterly filing, monthly payment, turnover up to Rs 5 crore), COMPOSITION (quarterly CMP-08 plus annual GSTR-4). Secondary: a CA who reviews the export.



\## NON-NEGOTIABLE PRINCIPLES

1\. AI is used ONLY to read images (extraction). All tax logic, validation, scheme logic and totals are deterministic code. Never let an LLM decide tax liability.

2\. Every extraction is shown to the user for review. Low-confidence fields are highlighted. Corrections are logged but never auto-used as training truth.

3\. Raw data, extracted (derived) data and human-verified data live in separate tables.

4\. Never fabricate accuracy, confidence or statistics. Show only values the code actually computed.

5\. GST rates, HSN mappings and thresholds live in a versioned DB table with effective\_from and source\_ref. Seed with clearly marked PLACEHOLDER values (verified=false). Add a UI banner: "Rates as of <date>, verify with official CBIC/GSTN notifications."

6\. No direct GST portal filing, no e-invoicing/IRN, no e-way bills, no inventory, no payments, no chatbot, no blockchain. Out of scope.

7\. Label demo/seed data as DEMO in the UI. Never present it as real.

8\. No secrets in code. Use environment variables and a .env.example.



\## DATA GROUNDING \& REAL EVALUATION ADDENDUM (MANDATORY)

\- Do NOT use LLM memory for GST rates, HSN mappings, or scheme thresholds. Load them only from `/seed/rate\_table\_seed.json` and `/seed/settings\_seed.json`, which are maintained from official CBIC/GSTN notifications in `/docs/official/`.

\- If a rate or threshold is missing from the rate table, return a WARNING saying `"rate not in verified table"` instead of guessing.

\- Any row with `verified=false` MUST produce a visible `"unverified rate"` warning in the UI and export header.

\- You may propose new rows from PDFs in `/docs/official/`, but each proposal must cite the notification number and page, and must be saved with `verified=false` for human review.

\- Real evaluation samples live in `/eval/real/dev/` (for prompt tuning) and `/eval/real/test/` (held-out set for final reporting only). Private—never commit, keep `/eval/real/` in `.gitignore`. Never tune on the test set. Never include synthetic samples in evaluation.

\- Until real samples exist in `/eval/real/`, `eval/eval\_extraction.py` must print `"NO VALIDATED RESULTS YET"`.

\- Synthetic/demo data is allowed ONLY in `/seed/demo\_data.json` for unit tests and the offline `DEMO` mode, always labeled `DEMO` in the UI.



\## TECH STACK

\- Frontend: React + Vite PWA (mobile-first, works on cheap phones), TypeScript, Tailwind. i18n with English and Hindi.

\- Backend: Python 3.11, FastAPI, Pydantic, SQLAlchemy, Alembic.

\- DB: PostgreSQL (SQLite allowed for local dev only).

\- Extraction: pluggable interface `ExtractionProvider.extract(image\_bytes) -> ExtractionResult`. Implement one provider using a multimodal LLM API (key from env), and a mock provider that returns fixtures for offline demo. Provider is chosen by env var EXTRACTION\_PROVIDER.

\- Export: openpyxl for Excel, plus JSON.

\- Auth: JWT (access token), bcrypt password hashing.

\- Storage: local disk behind a storage interface (swappable to S3 later).

\- Testing: pytest (backend), Vitest (frontend), one end-to-end test.

\- Deploy: Docker Compose (api, web, db). Single monolith. No microservices.



\## ARCHITECTURE

Owner (phone browser PWA)

&#x20; -> React frontend

&#x20; -> FastAPI backend (monolith)

\- auth module

\- documents module (upload, storage)

\- extraction module (provider interface)

\- validation module (deterministic rules engine, rule registry)

\- scheme module (REGULAR / QRMP / COMPOSITION logic)

\- export module (Excel/JSON)

&#x20; -> PostgreSQL

&#x20; -> output: reviewed entries, flagged errors, export file



Data flow: upload -> store raw -> extract -> save derived entries with confidence -> user reviews and edits -> save verified entries -> run validation -> user fixes errors -> export (blocked while BLOCKING errors remain).

Failure handling: if extraction fails or times out, return partial result and open the manual-entry form. Validation never depends on the network.



\## DATABASE (create with Alembic migrations)

\- users(id PK, email unique, password\_hash, business\_name, gstin, state\_code, scheme enum\[REGULAR,QRMP,COMPOSITION], language enum\[en,hi], created\_at)

\- documents(id PK, user\_id FK, file\_path, mime, sha256, uploaded\_at, doc\_type enum\[SALES,PURCHASE,REGISTER\_PAGE]) RAW

\- extracted\_entries(id PK, document\_id FK, line\_no, invoice\_no, invoice\_date, party\_name, party\_gstin, hsn\_or\_category, description, taxable\_value, tax\_rate, cgst, sgst, igst, total, field\_confidence JSONB, extraction\_provider, extraction\_model\_version, created\_at) DERIVED

\- entries\_reviewed(id PK, extracted\_entry\_id FK nullable, user\_id FK, same business fields as above, entry\_type enum\[SALES,PURCHASE], source enum\[EXTRACTED\_EDITED,MANUAL], reviewed\_at) HUMAN-VERIFIED

\- validation\_results(id PK, entry\_id FK, rule\_id, severity enum\[BLOCKING,WARNING,INFO], message\_key, message\_params JSONB, rule\_version, created\_at)

\- rate\_table(id PK, hsn\_or\_category, rate, effective\_from, effective\_to nullable, source\_ref, verified bool)

\- audit\_log(id PK, user\_id, action, entity, entity\_id, before JSONB, after JSONB, at)



Indexes: documents(user\_id, uploaded\_at); entries\_reviewed(user\_id, invoice\_date); entries\_reviewed(user\_id, party\_gstin, invoice\_no) UNIQUE-check support for duplicates; validation\_results(entry\_id).



\## AI / EXTRACTION SPEC

Input: image (jpg/png/webp, max 8 MB). Output JSON (validate with Pydantic; reject malformed):

{

&#x20; "entries": \[

&#x20;   {

&#x20;     "invoice\_no": "str|null",

&#x20;     "invoice\_date": "YYYY-MM-DD|null",

&#x20;     "party\_name": "str|null",

&#x20;     "party\_gstin": "str|null",

&#x20;     "hsn\_or\_category": "str|null",

&#x20;     "description": "str|null",

&#x20;     "taxable\_value": "number|null",

&#x20;     "tax\_rate": "number|null",

&#x20;     "cgst": "number|null",

&#x20;     "sgst": "number|null",

&#x20;     "igst": "number|null",

&#x20;     "total": "number|null",

&#x20;     "field\_confidence": { "<field>": "0..1" }

&#x20;   }

&#x20; ],

&#x20; "page\_notes": "str"

}

Rules: unreadable fields must be null, never guessed. The prompt sent to the model must say so. Store provider name and model version with every result. Add an evaluation script `eval/eval\_extraction.py` that compares extraction to a hand-labeled folder of REAL samples (`/eval/real/dev/\*.json` and `/eval/real/test/\*.json`) and prints field-level exact-match accuracy plus sample size. Do NOT include synthetic samples in this evaluation. Until real samples exist, the script prints `"NO VALIDATED RESULTS YET"`.



\## VALIDATION RULES (each rule = one function, one rule\_id, one unit test, bilingual message keys)

\- R01 GSTIN format (15 chars, regex, state code valid) and checksum digit.

\- R02 Tax arithmetic: cgst+sgst+igst == taxable\_value \* rate (tolerance Rs 1); total == taxable\_value + taxes.

\- R03 Intra vs inter-state: if party state code == business state code then CGST+SGST only, else IGST only.

\- R04 Rate vs HSN/category: compare against rate\_table valid on invoice\_date; WARNING if mismatch or if rate\_table row is unverified.

\- R05 Duplicate: same party\_gstin + invoice\_no (or same date+party+total) already exists.

\- R06 Date: invalid, future date, or outside the selected return period.

\- R07 Missing mandatory fields for scheme (e.g., party GSTIN missing on B2B sales).

\- R08 COMPOSITION scheme: flag any entry charging separate tax (composition dealers do not charge tax on invoices) and flag inter-state supplies.

\- R09 Negative or zero values, absurd outliers (INFO).

\- R10 Turnover vs scheme limit: warn when cumulative turnover nears the scheme limit (limits configurable in a settings table, seeded as unverified).



Blocking vs warning: R01, R02, R03, R05, R06 are BLOCKING; others WARNING/INFO.

Messages live in i18n files (en.json, hi.json) with params, e.g. "Rate 12% does not match HSN 1905 (expected 5%). Check the bill."



\## API (all under /api/v1, JSON, JWT required except auth)

\- POST /auth/register, POST /auth/login

\- GET/PATCH /me (business profile, gstin, state, scheme, language)

\- POST /documents (multipart; validates type, size, sha256; stores file) -> 201 {id}

\- POST /documents/{id}/extract -> {entries\[], status: OK|PARTIAL|FAILED}; on FAILED return 200 with status and empty list so UI falls back to manual entry

\- GET /documents/{id}/entries

\- POST /entries (manual entry) ; PATCH /entries/{id} (human correction, writes audit\_log)

\- POST /validate {period} -> results grouped by entry and severity

\- GET /validation/summary?period=

\- GET /export?period=\&format=xlsx|json -> 409 with error list if BLOCKING errors remain

\- GET /health



Every endpoint: Pydantic validation, consistent error shape {code,message,details}, per-user authorization (a user can only access their own rows).



\## EXPORT CONTENT

Scheme-aware sheet set. REGULAR/QRMP: B2B, B2C summary, purchases (for ITC reconciliation), tax summary. COMPOSITION: turnover summary and tax payable at the configured composition rate (rate configurable, unverified by default). Header sheet states: generated date, rate table version, "DRAFT: review before filing."



\## FRONTEND SCREENS (build only these)

1\. Login/Register and business profile (GSTIN, state, scheme, language).

2\. Upload (camera or file), shows progress.

3\. Review table: editable cells, low-confidence cells highlighted, per-row validation badges, click a badge to see the plain-language explanation (English/Hindi toggle).

4\. Summary: counts of BLOCKING/WARNING, period selector, Export button (disabled while BLOCKING errors exist).

Show a DEMO banner when data is seeded demo data. Show the "rates as of" banner on screens that display tax.



\## SECURITY

\- Secrets only from env (.env.example committed, .env gitignored). Never log secrets, image contents or full GSTINs (mask to first 2 and last 3 chars).

\- bcrypt hashing, short-lived JWT, authorization check on every resource.

\- Upload hardening: whitelist mime by magic bytes, size limit, random filenames, no path traversal, files stored outside web root.

\- SQLAlchemy parameterized queries only. Strict Pydantic validation on all inputs.

\- Rate limiting on auth and extract endpoints. CORS restricted to configured origin. HTTPS in deployment. Security headers.

\- Retention: setting to delete source images after export; document it in README (privacy treatment needs validation).



\## REPO STRUCTURE

\- `/backend` (app/main.py, api/, core/, models/, schemas/, services/{extraction,validation,scheme,export}, rules/R01..R10.py, i18n/, tests/, alembic/)

\- `/frontend` (src/pages, src/components, src/i18n, src/api)

\- `/eval` (real/dev, real/test, eval\_extraction.py)

\- `/seed` (demo\_data.json clearly labeled DEMO, rate\_table\_seed.json with verified=false, settings\_seed.json)

\- `/docs/official` (CBIC/GSTN PDFs + SOURCES.md)

\- `docker-compose.yml`, `.env.example`, `README.md`



\## BUILD ORDER (finish and test each before moving on)

1\. Backend skeleton, DB migrations, auth, health.

2\. Upload endpoint and storage.

3\. Extraction provider interface, mock provider, then real provider; /extract endpoint with failure fallback.

4\. Validation engine with all rules R01-R10 and unit tests (write tests first for R01-R05).

5\. Scheme logic and export.

6\. Frontend: upload -> review table -> validation badges -> export.

7\. Hindi messages, confidence highlighting, banners.

8\. End-to-end test, Docker Compose, README with run instructions and demo script.

Do not start UI polish before step 5 passes.



\## ACCEPTANCE CRITERIA

\- Upload a sample image, get extracted rows (or mock fixtures offline), edit them, see validation errors with explanations, fix them, and export an xlsx, all end-to-end.

\- Each rule has a passing unit test, including negative cases.

\- Export is blocked with a clear message while BLOCKING errors exist.

\- A user cannot read another user's documents or entries (tested).

\- App runs fully offline using the mock provider (demo fallback).

\- No secrets in the repo; eval script prints real numbers or "NO VALIDATED RESULTS YET".



When something is ambiguous, choose the simplest option, state the assumption in the README under "Assumptions", and continue. Do not ask me questions unless blocked.

