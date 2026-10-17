#!/bin/sh
# Prepara o que o volume montado como root pode ter deixado inacessível e DESCE de privilégio:
# o app (Next.js) nunca roda como root dentro do container.
set -e
mkdir -p /app/public/uploads/products /app/public/uploads/banners
chown -R node:node /app/public/uploads /app/.next/cache 2>/dev/null || true
exec su-exec node sh -c "npx prisma db push && npm start"
