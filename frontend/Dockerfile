FROM node:18-slim AS builder
WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build Next.js
COPY . .
RUN npm run build

FROM node:18-slim
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy necessary artifacts
COPY --from=builder /usr/src/app/.next ./.next
COPY --from=builder /usr/src/app/public ./public
COPY --from=builder /usr/src/app/package.json ./package.json

EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]
