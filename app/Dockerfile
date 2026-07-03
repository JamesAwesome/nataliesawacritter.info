FROM node:26.4.0-slim AS build

# Node 25+ images no longer bundle corepack; install pnpm directly.
RUN npm install -g pnpm@11.9.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

FROM node:26.4.0-slim

RUN npm install -g pnpm@11.9.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle

# Photo uploads land here (named volume). Create it owned by node so the
# volume inherits writable ownership on first use.
RUN mkdir -p /data/photos && chown node:node /data/photos

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node

CMD ["node", "dist/server/index.js"]
