# Backend Dockerfile
FROM node:20-alpine

# Install curl for Docker healthcheck
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies for build
RUN npm ci --include=dev

# Copy app source
COPY . .

# Build the application
RUN npm run build

# Remove devDependencies to reduce attack surface in production image
RUN npm prune --omit=dev

# Change ownership of app directory
RUN chown -R nextjs:nodejs /app
USER nextjs

# Expose port
EXPOSE 3004

# Start the application
CMD ["npm", "run", "start:prod"]