FROM node:22-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install --frozen-lockfile --ignore-scripts
COPY backend ./backend
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/src/schema.sql ./backend/src/schema.sql
USER node
CMD ["node","backend/dist/server.js"]
