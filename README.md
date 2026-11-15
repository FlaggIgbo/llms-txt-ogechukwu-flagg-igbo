# llms-txt-ogechukwu-flagg-igbo (`llmstxt-directory`)

A TypeScript & React monorepo for generating, indexing, and serving [`llms.txt`](https://llmstxt.org/) and `llms-full.txt` files across websites.

## Architecture Overview

This repository is organized as an npm workspaces monorepo separating deployable runtimes (`apps/`) from shared internal libraries (`packages/`) and infrastructure (`infra/`):

```text
llms-txt-ogechukwu-flagg-igbo/
├── .github/
│   └── workflows/
│       └── ci.yml                  # Automated linting, testing, and build checks
├── apps/
│   ├── web/                        # React Frontend (Home & "Add Entry" pages)
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── components/         # Search bar, directory cards, submission form
│   │   │   ├── pages/              # HomePage (browse/search) & AddEntryPage
│   │   │   ├── hooks/              # API polling/fetching hooks
│   │   │   └── App.tsx
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── api/                        # API Gateway & Database Read / Pull Services
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── entries.ts      # GET /entries (DB Read), POST /entries (Push to Queue)
│   │   │   │   └── search.ts       # GET /search (Elasticsearch / DB lookup)
│   │   │   ├── services/
│   │   │   │   ├── searchService.ts
│   │   │   │   └── storageService.ts # Presigned URLs or S3 file retrieval
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   ├── worker/                     # Request / Database Write (Queue Consumer)
│   │   ├── src/
│   │   │   ├── consumers/
│   │   │   │   └── generateConsumer.ts # Listens to queue for new URL requests
│   │   │   ├── services/
│   │   │   │   ├── scraper.ts      # Crawls target website
│   │   │   │   ├── llmsGenerator.ts# Formats scraped content into llms.txt / llms-full.txt
│   │   │   │   └── storageUpload.ts# Uploads generated files to S3 Bucket
│   │   │   └── index.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── cron-updater/               # Scheduled Updater
│       ├── src/
│       │   ├── jobs/
│       │   │   └── checkStaleSites.ts # Queries DB, re-runs generation, logs to Update Logs Bucket
│       │   └── index.ts
│       ├── Dockerfile
│       └── package.json
├── packages/
│   ├── database/                   # Shared PostgreSQL Schema & Client
│   │   ├── migrations/             # SQL migrations (id, website_url, is_updated_latest, etc.)
│   │   ├── schema.prisma           # Single source of truth for DB tables
│   │   └── index.ts                # Exported DB client used by api, worker, and cron
│   ├── queue/                      # Shared Queue Producer/Consumer Config
│   │   └── index.ts                # Job definitions and Redis/BullMQ/SQS connection setup
│   └── shared-types/               # TypeScript Interfaces & Validation
│       └── index.ts                # Shared DTOs (SiteEntry, SearchQuery, UpdateLog)
├── infra/                          # Infrastructure & Local Dev Orchestration
│   ├── docker-compose.yml          # Spins up Postgres, Elasticsearch, Redis, & LocalStack (S3)
│   └── terraform/                  # Cloud definitions for S3 buckets, RDS, and ECS/Lambda
├── .env.example                    # Template for DB URLs, S3 bucket names, Elasticsearch host
├── package.json                    # Workspace root
└── README.md                       # Architecture overview and local setup instructions
```

## Quick Start (Local Development)

1. **Copy environment variables:**
   ```bash
   cp .env.example .env
   ```

2. **Start local storage & search primitives (Postgres, Redis, Elasticsearch, LocalStack S3):**
   ```bash
   npm run infra:up
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Start the services:**
   ```bash
   # Terminal 1: API Gateway (http://localhost:4000)
   npm run dev:api

   # Terminal 2: Async Queue Worker
   npm run dev:worker

   # Terminal 3: React Web Client (http://localhost:3000)
   npm run dev:web

   # Terminal 4 (Optional): Scheduled Cron Updater
   npm run dev:cron
   ```
