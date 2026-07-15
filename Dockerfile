#------------STAGE 1------------#
# Base image
FROM node:24-bullseye-slim AS base

#-------------STAGE 2------------#
# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

#-------------STAGE 3------------#
# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the NestJS app
RUN npm run build

#------------STAGE 4------------#
# Production image, copy all the files and run nest
FROM base AS runner
WORKDIR /app

# Copy built code and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/data ./data
COPY package*.json ./

CMD sh -c "npx prisma migrate deploy; node dist/prisma/seed.js; node dist/src/main.js"