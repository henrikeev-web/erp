FROM node:22-alpine

RUN apk add --no-cache libc6-compat su-exec

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Gera o client Prisma 7 (→ src/generated/prisma/client)
RUN npx prisma generate

# Build do Next.js
RUN npm run build

# Pastas de upload persistidas via volume
RUN mkdir -p public/uploads/products public/uploads/banners

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

# Entrypoint: ajusta permissões dos uploads (volume) e inicia o app como usuário "node" (sem root)
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app/.next /app/public
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
