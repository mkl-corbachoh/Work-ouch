FROM node:24-bookworm-slim AS dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && chown -R node:node /app/node_modules

FROM dependencies AS development

ENV NODE_ENV=development

COPY --chown=node:node . .

USER node

EXPOSE 5173

CMD ["npm", "run", "dev"]

FROM dependencies AS build

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_AUTH_PROVIDERS=google
ARG VITE_AUTH_SCOPES_JSON={}

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_AUTH_PROVIDERS=$VITE_AUTH_PROVIDERS \
    VITE_AUTH_SCOPES_JSON=$VITE_AUTH_SCOPES_JSON

COPY . .
RUN npm run build

FROM nginx:1.28-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=5 \
  CMD ["wget", "--quiet", "--spider", "http://127.0.0.1/"]
