# syntax=docker/dockerfile:1
# TrackWise: Next.js 16, npm, port 3015

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3015

# Keep the full npm installation so one-off Drizzle schema commands work
# with: docker compose run --rm trackwise npm run db:push
# This is a beginner-friendly setup; the production image can be slimmed later.
COPY --from=builder --chown=node:node /app ./
USER node

EXPOSE 3015
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]
