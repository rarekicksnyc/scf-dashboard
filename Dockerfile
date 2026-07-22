# Production image for the SCF Discounting Control Tower (Next.js).
# Two stages: build the app, then run the slim standalone server.

# ---- Stage 1: build ----
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies from the lockfile (reproducible).
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle (emits .next/standalone — see next.config.js).
COPY . .
RUN npm run build

# ---- Stage 2: run ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# The app listens on $PORT (defaults to 3000). Set APP_PASSWORD to enable the
# site password gate (see middleware.ts).
ENV PORT=3000

# Copy only what the standalone server needs.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
