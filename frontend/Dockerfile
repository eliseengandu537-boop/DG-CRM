FROM node:18-slim AS builder
WORKDIR /usr/src/app

# Build arguments for Next.js public environment variables
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Make them available as environment variables during build
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=$NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

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
