# Frontend Dockerfile
FROM node:20-alpine AS builder

# Create app directory
WORKDIR /app

# Accept backend URL at build time
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci --include=dev --legacy-peer-deps

# Copy app source
COPY . .

# Build the Next.js application
RUN npm run build

# Production stage
FROM node:20-alpine AS production

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built files from builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/next-env.d.ts ./next-env.d.ts

# Change ownership of app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3000

# Start the application
CMD ["npx", "next", "start"]