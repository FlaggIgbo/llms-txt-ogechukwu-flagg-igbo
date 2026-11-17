# llms.txt Directory Monorepo

A service for discovering, generating, validating, and serving standard-compliant `llms.txt` and `llms-full.txt` files for AI agents and LLMs.

---

## Setup & Local Development

### Prerequisites

- **Node.js**: `>= 22.0.0`
- **Docker**: Runs local PostgreSQL and MinIO (S3-compatible storage that stands in for Cloudflare R2)

### 1. Install Dependencies

```bash
npm install
npx playwright install chromium   # headless browser used by the worker's scraper and the E2E tests
```

### 2. Configure Environment

Copy `.env.example` to `.env` and adjust variables as needed:

```bash
cp .env.example .env
```

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string (defaults to local Docker instance).
- `STORAGE_PROVIDER`: `minio` for local S3-compatible storage via Docker, or `r2` for Cloudflare R2 in production.
- `GEMINI_API_KEY`: API key for AI categorization and link summarization.
- `SENTRY_DSN` / `VITE_SENTRY_DSN`: Optional error tracking.

### 3. Start Local Infrastructure

Start the local PostgreSQL and MinIO S3-compatible storage cluster:

```bash
npm run infra:up
```

Infrastructure services started:
- **PostgreSQL**: `localhost:5432` (`postgres:postgres`, DB: `llmstxt_directory`)
- **MinIO S3 API**: `http://localhost:9000`
- **MinIO Web Console**: `http://localhost:9001` (Username: `minioadmin` / Password: `minioadmin`)

*(Optional)* Sync existing generated files from production Cloudflare R2 into your local MinIO. This needs `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.env` (read-only keys are enough) and only copies from R2 → MinIO, never the other way:
```bash
npm run infra:sync-r2
```

Apply database migrations:

```bash
npm run db:migrate
```

### 4. Run Development Services

Start individual services as needed:

```bash
npm run dev:web      # React frontend (Vite)
npm run dev:api      # HTTP API Gateway
npm run dev:worker   # Queue worker (scraper & generator)
npm run dev:cron     # Periodic cadence updater
```

To shut down local infrastructure when finished:

```bash
npm run infra:down
```

---

## Testing & Quality Assurance

```bash
# Run unit tests across all workspaces
npm test

# Run linter across all workspaces
npm run lint

# Run TypeScript typechecks
npm run typecheck

# Run Playwright end-to-end integration flow
npm run test:e2e

# Regenerate component and page visual screenshot baselines
npm run screenshots
```

---

## Deployment

### 1. Production Build

Build production bundles across all workspaces:

```bash
npm run build
```

Frontend build artifacts are emitted to `apps/web/dist`.

### 2. Services Overview

The system consists of four primary services:

- **Static Web Frontend (`apps/web`)**: Single-page application served via CDN or static host (e.g. Render Static Site, Cloudflare Pages, Vercel).
- **API Gateway (`apps/api`)**: Node.js web service exposing directory search, status, and submission endpoints.
- **Queue Worker (`apps/worker`)**: Background worker processing site jobs via PostgreSQL `SKIP LOCKED` polling, web scraping, and file generation.
- **Cadence Updater (`apps/cron-updater`)**: Background worker periodically evaluating site change frequency and queuing re-indexing jobs.

### 3. Cloud Storage (Cloudflare R2)

Production stores generated `llms.txt` / `llms-full.txt` files in the Cloudflare R2 bucket `llmstxt-files-bucket`.

**a. Provision the bucket** with Terraform (`infra/terraform/`). It requires a Cloudflare API token with R2 edit permissions:

```bash
cd infra/terraform
terraform init
terraform apply \
  -var="cloudflare_account_id=<your-account-id>" \
  -var="cloudflare_api_token=<your-api-token>"
```

**b. Create an R2 API token** (Cloudflare dashboard → R2 → Manage API Tokens) with Object Read & Write on the bucket. This gives you `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY`.

**c. Enable public access** to the bucket (an `r2.dev` subdomain or a custom domain) and use that URL as `R2_PUBLIC_URL`. Download links redirect users there, so it must be publicly readable. Do not use the `*.r2.cloudflarestorage.com` S3 API endpoint, because it requires signed requests.

### 4. Hosting (Render Blueprint)

`render.yaml` is a Render Blueprint that provisions the PostgreSQL database, static web frontend, API gateway, worker (Docker, with Chromium preinstalled), and cron updater. In the Render dashboard choose **New → Blueprint** and point it at this repo.

`STORAGE_PROVIDER` is pinned to `r2` in `render.yaml`. Values marked `sync: false` are secrets and must be entered by hand in the Render dashboard:

| Variable | Services | Required |
| :--- | :--- | :--- |
| `CLOUDFLARE_ACCOUNT_ID` | api, worker | Yes |
| `R2_ACCESS_KEY_ID` | api, worker | Yes |
| `R2_SECRET_ACCESS_KEY` | api, worker | Yes |
| `R2_PUBLIC_URL` | api, worker | Yes (public bucket URL, see above) |
| `GEMINI_API_KEY` | worker | Recommended (without it, the worker falls back to rule-based categorization) |
| `SENTRY_DSN` | api, worker, cron-updater | Optional |
| `VITE_SENTRY_DSN` | web | Optional |

`DATABASE_URL` is wired automatically from the Render database.

### 5. Production Database Migrations

Migrations are **not** run automatically on deploy. After the first deploy, and whenever a new file is added to `packages/database/migrations/`, run them against the Render database using its **External Database URL** (Render dashboard → database → Connect):

```bash
DATABASE_URL="<render-external-database-url>" npm run db:migrate
```
