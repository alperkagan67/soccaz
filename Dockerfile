# syntax=docker/dockerfile:1.7
# Drei Ziele: "deps" (alle Abhängigkeiten), "tools" (Migrationen, Wartung), "runner" (schlanke App)

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL wird beim Bauen nur als Platzhalter gebraucht (kein Zugriff)
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build

# Werkzeug-Image: Migrationen und Wartungsskripte (mit allen Abhängigkeiten)
FROM deps AS tools
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY data ./data
CMD ["node", "scripts/migrate.mjs"]

FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S socaz && adduser -S socaz -G socaz
COPY --from=build --chown=socaz:socaz /app/.next/standalone ./
COPY --from=build --chown=socaz:socaz /app/.next/static ./.next/static
COPY --from=build --chown=socaz:socaz /app/public ./public
USER socaz
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
