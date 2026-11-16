FROM node:20-bookworm-slim

WORKDIR /app

# Copy root monorepo files
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/worker ./apps/worker

# Install npm dependencies
RUN npm install

# Install Playwright Chromium with system dependencies (runs as root inside container)
RUN npx playwright install --with-deps chromium

CMD ["npm", "run", "dev:worker"]
