# llms.txt Directory Monorepo

A service for discovering, generating, validating, and serving standard-compliant `llms.txt` and `llms-full.txt` files for AI agents and LLMs.

---

## Setup & Local Development

### Prerequisites

- **Node.js**: `>= 20.0.0`
- **Docker**: For running local PostgreSQL and infrastructure dependencies

### 1. Install Dependencies

```bash
npm install
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

*(Optional)* Sync existing generated files from production Cloudflare R2 into your local MinIO:
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

Generated `llms.txt` and `llms-full.txt` files can be stored in Cloudflare R2 buckets. Terraform configurations in `infra/terraform/` provision the required buckets:

```bash
cd infra/terraform
terraform init
terraform apply
```

Set `STORAGE_PROVIDER="r2"` along with `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and bucket names in production.

### 4. Hosting (Render Blueprint)

A multi-service configuration is provided in `render.yaml` for deploying the database, static web frontend, API gateway, worker, and cron updater.
