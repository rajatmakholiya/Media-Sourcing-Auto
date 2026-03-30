# ── Stage 1: Dependencies ──────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: Build ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Build Next.js in standalone mode
RUN npm run build

# ── Stage 3: Production ───────────────────────────────────
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install Chromium dependencies for Remotion rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Tell Remotion/Puppeteer where Chromium is
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV CHROME_PATH=/usr/bin/chromium
ENV REMOTION_CHROME_EXECUTABLE=/usr/bin/chromium

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built app (standalone output)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy the Remotion render script and source (needed for bundling at render time)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/remotion ./src/remotion

# Copy Remotion dependencies (needed by render.mjs)
COPY --from=deps /app/node_modules/@remotion ./node_modules/@remotion
COPY --from=deps /app/node_modules/remotion ./node_modules/remotion
COPY --from=deps /app/node_modules/@remotion/bundler ./node_modules/@remotion/bundler
COPY --from=deps /app/node_modules/@remotion/renderer ./node_modules/@remotion/renderer
COPY --from=deps /app/node_modules/@remotion/cli ./node_modules/@remotion/cli

# Create tmp directories for exports
RUN mkdir -p tmp/exports tmp/outputs && chown -R nextjs:nodejs tmp

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
