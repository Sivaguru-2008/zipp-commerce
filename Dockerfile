# Multi-stage Dockerfile — production-only deps, non-root user, runs as PID 1
# via dumb-init so SIGTERM reaches Node and the graceful-shutdown handler.
#
# Build: docker build -t zipp-commerce .
# Run:   docker run -p 5000:5000 --env-file backend/.env zipp-commerce

FROM node:24-alpine AS deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24-alpine AS runtime
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
ENV PORT=5000

# Non-root user — node image already ships `node:node` (uid 1000).
WORKDIR /app
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend
RUN chown -R node:node /app

USER node
WORKDIR /app/backend

EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
