# --- Build stage: install everything and compile TypeScript -> dist/ ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build

# --- Runtime stage: production deps only, run the compiled JS ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# The host injects PORT; the app reads process.env.PORT (defaults to 3000).
EXPOSE 3000
CMD ["node", "dist/index.js"]
