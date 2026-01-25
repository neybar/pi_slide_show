FROM node:22-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application files
COPY server.mjs ./
COPY lib/ ./lib/
COPY www/ ./www/

# Install frontend dependencies
WORKDIR /app/www
RUN npm ci --only=production
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S slideshow -u 1001 -G nodejs && \
    chown -R slideshow:nodejs /app

USER slideshow

EXPOSE 3000

ENV PHOTO_LIBRARY=/photos
ENV PORT=3000
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.mjs"]
