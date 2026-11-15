FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY packages ./packages
COPY apps/cron-updater ./apps/cron-updater
RUN npm install
CMD ["npm", "run", "dev:cron"]
