FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY backend ./backend
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --prod --frozen-lockfile
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/src/schema.sql ./backend/src/schema.sql
USER node
CMD ["node","backend/dist/server.js"]

