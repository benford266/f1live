# Backend Dockerfile
FROM node:20-alpine

# Install build dependencies and runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    python3 \
    make \
    g++ \
    libc6-compat \
    && ln -sf python3 /usr/bin/python

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies (keep build tools for native modules)
RUN npm ci --omit=dev && npm cache clean --force

# Copy source code
COPY . .

# Create necessary directories and set permissions
RUN mkdir -p logs data && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "http.get('http://localhost:3001/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]