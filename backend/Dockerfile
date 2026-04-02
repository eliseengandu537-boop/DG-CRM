FROM node:18-slim AS builder

WORKDIR /usr/src/app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Install build dependencies and app dependencies
COPY package*.json tsconfig*.json ./
COPY prisma ./prisma
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:18-slim
WORKDIR /usr/src/app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Only install production deps
COPY package*.json ./
COPY --from=builder /usr/src/app/prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# Copy compiled app
COPY --from=builder /usr/src/app/dist ./dist

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
