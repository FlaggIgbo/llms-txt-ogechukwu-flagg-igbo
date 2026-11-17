#!/usr/bin/env bash
set -euo pipefail

# Load .env
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be set in .env"
  exit 1
fi

BUCKET="${R2_LLMS_TXT_BUCKET:-llmstxt-files-bucket}"
R2_ENDPOINT="https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "Syncing Cloudflare R2 bucket '${BUCKET}' to local MinIO..."
docker run --rm --network infra_default --entrypoint /bin/sh pgsty/mc -c "
  mc alias set local http://minio:9000 minioadmin minioadmin --quiet;
  mc alias set r2 ${R2_ENDPOINT} ${R2_ACCESS_KEY_ID} ${R2_SECRET_ACCESS_KEY} --api S3v4 --quiet;
  mc mirror --overwrite r2/${BUCKET} local/${BUCKET};
"
echo "Sync complete! View files at http://localhost:9001/browser/${BUCKET}"
