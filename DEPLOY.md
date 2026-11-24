# KhataGST Deployment Guide (Free-Tier Hackathon)

This guide provides exact, step-by-step instructions to deploy **KhataGST** completely on free-tier cloud infrastructure with zero budget, or run it 100% offline using Docker Compose.

---

## Architecture Overview

| Component | Target Service | Free Tier Specs |
| :--- | :--- | :--- |
| **Frontend** | Render Static Site / Cloudflare Pages | Unlimited bandwidth, global CDN, instant invalidation |
| **Backend** | Render Free Web Service | Python 3.11, 512 MB RAM, spins down after 15 min inactivity |
| **Database** | Neon Serverless Postgres / Supabase | 0.5 GB storage, auto-scaling compute, pooled connections |
| **OCR / AI** | Google Gemini 1.5 Flash (`EXTRACTION_PROVIDER=gemini`) | Free tier API key (or `mock` offline fixtures) |
| **Storage** | Temporary in-memory/temp or Supabase Storage / S3 | Default: `STORAGE_MODE=temp` (clean ephemeral processing) |

---

## 1. Managed Postgres Setup (Neon or Supabase)

KhataGST requires an external PostgreSQL database. Both Neon and Supabase provide instant free-tier databases.

### Option A: Neon Postgres (Recommended - Fastest Setup)
1. Go to [neon.tech](https://neon.tech) and create a free account.
2. Click **Create Project** -> Name it `khatagst` -> Select the region closest to your users (e.g. `ap-southeast-1` or `eu-central-1`).
3. Under **Connection Details**, copy the **Pooled connection string**.
   - It will look like:
     ```
     postgres://neondb_owner:abc123xyz@ep-mute-wave-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require
     ```
   *(KhataGST backend automatically normalizes `postgres://` to `postgresql://`)*

### Option B: Supabase Postgres
1. Go to [supabase.com](https://supabase.com) and sign in.
2. Click **New Project** -> Name it `khatagst` -> Set a strong database password.
3. In **Project Settings** -> **Database** -> **Connection string** -> Select **URI** (Transaction pooler, port 6543).
4. Replace `[YOUR-PASSWORD]` with your database password.

---

## 2. Deploy Backend on Render

The backend is configured as a native Render Web Service (no Docker build delay).

### Method A: One-Click via Render Blueprint (`render.yaml`)
1. Push your repository to GitHub.
2. In [dashboard.render.com](https://dashboard.render.com), click **New +** -> **Blueprint**.
3. Connect your repository. Render detects `backend/render.yaml` automatically.
4. Fill in the required environment variables:
   - `DATABASE_URL`: Your Neon or Supabase connection string from Step 1.
   - `JWT_SECRET`: Generate a secure random key (e.g. `openssl rand -hex 32` or 32+ characters).
   - `ALLOWED_ORIGIN`: Your frontend URL (or temporary `http://localhost:5173` until frontend is live).
   - `GEMINI_API_KEY`: Your Google Gemini API key (or leave empty if using `EXTRACTION_PROVIDER=mock`).
5. Click **Apply**.

### Method B: Manual Web Service Setup
1. In Render Dashboard, click **New +** -> **Web Service**.
2. Connect your KhataGST repository.
3. Configure the service settings:
   - **Name**: `khatagst-backend`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Region**: Same or nearest region to your database
   - **Branch**: `main`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. Expand **Advanced** -> **Health Check Path**: `/health`
5. Click **Add Environment Variable** and enter:

| Variable Name | Value | Notes |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgres://user:pass@host/db?sslmode=require` | From Step 1 |
| `JWT_SECRET` | *(64-char hex string)* | e.g. run `python -c "import secrets; print(secrets.token_hex(32))"` |
| `ALLOWED_ORIGIN` | `https://khatagst.onrender.com` | Your frontend production URL |
| `EXTRACTION_PROVIDER` | `gemini` (or `mock`) | Use `mock` for 100% offline demo fixtures |
| `GEMINI_API_KEY` | *(your Gemini API key)* | Required only if `EXTRACTION_PROVIDER=gemini` |
| `STORAGE_MODE` | `temp` | Clean temporary storage (no S3 setup needed) |
| `LOG_LEVEL` | `INFO` | GSTINs are automatically masked in logs |
| `PORT` | `10000` | (Render sets this automatically) |

6. Click **Create Web Service**. Wait for build and deployment to complete.
7. Note your backend URL: `https://khatagst-backend.onrender.com`.

---

## 3. Run Database Migrations

Run Alembic migrations once to initialize database tables and seed GST tax rates:

### Option A: From Render Shell (In Dashboard)
1. Go to your `khatagst-backend` service in the Render Dashboard.
2. Click **Shell** in the left sidebar.
3. Run:
   ```bash
   python scripts/migrate.py
   ```
   *Output will confirm table creation and GST rate table seeding.*

### Option B: From Your Local Machine
You can run migrations against your remote database from your local workstation:
```bash
# In the backend directory
export DATABASE_URL="your_neon_or_supabase_postgres_url"
python scripts/migrate.py
```
*(On Windows PowerShell: `$env:DATABASE_URL="your_neon_or_supabase_postgres_url"; python scripts/migrate.py`)*

---

## 4. Deploy Frontend (Static Site)

The frontend is a Vite + React PWA optimized for mobile screen dimensions (390x844).

### Deploying to Render Static Site
1. In Render Dashboard, click **New +** -> **Static Site**.
2. Connect your KhataGST repository.
3. Configure settings:
   - **Name**: `khatagst-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. Add Environment Variable:
   - `VITE_API_URL`: `https://khatagst-backend.onrender.com/api/v1` (backend URL with `/api/v1`)
5. Click **Create Static Site**.
6. The `frontend/public/_redirects` file (`/* /index.html 200`) ensures client-side routing works seamlessly across all paths.
7. Once deployed, note your frontend URL (e.g. `https://khatagst.onrender.com`).
8. **Important**: Go back to your backend service settings on Render, update `ALLOWED_ORIGIN` to match your frontend URL (e.g. `https://khatagst.onrender.com`), and save.

### Alternative: Deploying to Cloudflare Pages
1. Go to Cloudflare Dashboard -> **Workers & Pages** -> **Create application** -> **Pages**.
2. Connect GitHub repo -> Select `frontend` root directory.
3. Framework preset: `Vite`.
4. Build command: `npm run build`, output directory: `dist`.
5. Environment variable: `VITE_API_URL=https://khatagst-backend.onrender.com/api/v1`.
6. Save and deploy.

---

## 5. Verification & Smoke Testing

Run the following checks to verify production health before user testing:

### 1. Health & Database Connectivity Check
Visit:
```bash
curl -i https://khatagst-backend.onrender.com/health
```
Expected response:
```json
{
  "status": "healthy",
  "app": "KhataGST API",
  "version": "1.0.0",
  "database": "connected"
}
```
*(Notice: No database credentials or internal hostnames are exposed)*

### 2. User Signup & Authentication Smoke Test
```bash
curl -X POST https://khatagst-backend.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "9876543210",
    "password": "demoPassword123!",
    "business_name": "Sharma Provision Store",
    "gstin": "27AAPFU0939F1ZV",
    "composition_scheme": false
  }'
```
Expected response: HTTP 201 with access token and user payload.

### 3. End-to-End Mobile Flow Test
1. Open the frontend URL on a phone connected to cellular data (e.g., 4G/5G).
2. Register or log in with test credentials.
3. Tap **Scan** -> Take a photo of a bill or invoice (or choose from gallery).
4. Verify extraction populates fields in the **Review** screen.
5. Review the return readiness score and verify severity badges (Blocking / Warning / OK).
6. Tap **Export** -> Download GST return in Excel/JSON format.

---

## 6. Pre-Demo Hackathon Checklist

Free-tier cloud containers (Render, Neon) enter deep sleep after 15 minutes of inactivity. Follow this checklist 5-10 minutes before presenting to judges:

- [ ] **Warm Up Instance (5 minutes prior)**: Open `https://khatagst-backend.onrender.com/health` in your phone browser. If it is sleeping, it will take ~40-50 seconds to boot. Once it returns `{"status":"healthy"}`, subsequent requests respond in under 150ms.
- [ ] **Verify Cold-Start UI Banner**: If opened cold, KhataGST frontend displays a friendly amber waking banner:
  > *"Waking up the server, this can take up to a minute... [Retry]"*
  Zero technical error codes or crash dialogs are shown to the user.
- [ ] **Check Mobile Viewport**: Open the URL on Chrome Mobile or Safari Mobile. Ensure bottom navigation is visible, touch targets are at least 48px, and fonts render cleanly in both English and Hindi.
- [ ] **Offline Backup Ready**: If venue Wi-Fi or cellular connectivity is unreliable, launch the offline Docker container on your laptop (see Section 7 below).

---

## 7. 100% Offline Local Run (Docker Compose)

KhataGST includes a fully self-contained offline mode with local PostgreSQL, pre-seeded demo fixtures, and `EXTRACTION_PROVIDER=mock`:

```bash
# Clone and enter directory
cd KhataGST

# Launch frontend, backend, and PostgreSQL with zero external dependencies
docker-compose up --build
```

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **Health Check**: http://localhost:8000/health
- **Mock OCR**: Extracts authentic Indian GST invoice fixtures without an internet connection or Gemini API key.

---

## 8. Security & Compliance Reference

- **No Secrets in Repo**: All sensitive keys (`DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`) are read strictly from environment variables. `.env` and `/eval/real` are ignored by Git.
- **GSTIN Masking**: `GSTINMaskingFilter` masks all 15-character GSTIN occurrences (`27**********1Z5`) in logs to protect shopkeeper privacy.
- **Rate Limiting**: Built-in sliding-window rate limiters prevent brute-force abuse on `/auth` (15 req/min) and `/extract` (10 req/min) endpoints without requiring external Redis instances.
- **Strict CORS**: Wildcard origins (`*`) are rejected in production. Only the configured `ALLOWED_ORIGIN` is permitted.

