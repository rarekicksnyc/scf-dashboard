# Production image for the SCF Discounting Control Tower (Next.js).
# Two stages: build the app, then run it with "next start" (npm start).

# ---- Stage 1: build ----
FROM node:20-slim AS builder
WORKDIR /app

# Install dependencies from the lockfile (reproducible).
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle.
COPY . .
RUN npm run build

# ---- Stage 2: run ----
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# The app listens on $PORT (defaults to 3000). Set SESSION_SECRET (required),
# DATABASE_URL (durable storage), and optionally APP_PASSWORD — see DEPLOY.md.
ENV PORT=3000

# Copy the built application.
COPY --from=builder /app ./

EXPOSE 3000
CMD ["npm", "start"]
