FROM node:20-alpine

RUN apk add --no-cache libc6-compat

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

# Aplica o schema no banco e inicia o servidor
CMD ["sh", "-c", "npx prisma db push && npm start"]
