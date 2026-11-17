FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm install
EXPOSE 3000
CMD ["npm", "run", "dev:web", "--", "--host", "0.0.0.0"]
