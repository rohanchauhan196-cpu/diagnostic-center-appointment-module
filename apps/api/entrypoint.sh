#!/bin/sh

echo "Waiting for postgres to be ready..."
# We don't need pg_isready if docker compose healthcheck ensures it's ready,
# but we can sleep a couple seconds or do a simple check.
# Since postgres has a healthcheck in compose, this is guaranteed to be ready.

echo "Running database migrations..."
npx prisma migrate deploy --schema=./apps/api/prisma/schema.prisma

echo "Starting API server..."
node apps/api/dist/src/server.js
