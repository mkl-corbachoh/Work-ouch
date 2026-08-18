FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci && chown -R node:node /app/node_modules

FROM dependencies AS development

ENV NODE_ENV=development \
    PORT=3000 \
    DATABASE_PATH=/app/data/training.db

COPY --chown=node:node tsconfig.json tsconfig.build.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node database ./database

RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000

CMD ["npm", "run", "dev"]

FROM dependencies AS build

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build \
    && npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/app/data/training.db

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node database ./database

RUN mkdir -p /app/data && chown node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"]

CMD ["node", "dist/server.js"]
