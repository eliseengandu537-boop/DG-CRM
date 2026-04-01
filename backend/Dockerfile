FROM node:18-slim AS builder

WORKDIR /usr/src/app

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

# Only install production deps
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled app and prisma client
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/prisma ./prisma

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
