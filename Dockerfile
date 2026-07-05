# hanimo-webui — production container
# Author: Kim Jiwon (김지원) https://github.com/flykimjiwon
# License: Apache-2.0
#
# Single-stage, reliability-first image (keeps node_modules so DB setup
# scripts — pg/bcryptjs/dotenv — work inside the container).
# For "anyone can self-host in 5 minutes": see docker-compose.yml.

FROM node:20-alpine

# tini for proper signal handling, libc compat for some native deps
RUN apk add --no-cache tini

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# App source
COPY . .

# Build (DB not needed at build time)
ENV NEXT_TELEMETRY_DISABLED=1
RUN SKIP_DB_CONNECTION=true npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# Idempotent: setup-postgres / create-admin use IF NOT EXISTS / skip-if-exists
CMD ["sh", "-c", "npm run setup-postgres && npm run create-admin && npm run start"]
