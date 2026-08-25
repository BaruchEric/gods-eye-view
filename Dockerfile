# syntax=docker/dockerfile:1
# God's Eye View, production container for gev.beric.ca.
# Stage 1 builds dist/ (the Google browser key is baked in by vite's define block).
# Stage 2 runs `vite preview`, which serves dist/ and mounts every /api proxy
# from vite.config.js (see withPreviewParity there).

FROM node:26-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG GOOGLE_MAPS_API_KEY
ARG CESIUM_ION_TOKEN=
ENV GOOGLE_MAPS_API_KEY=$GOOGLE_MAPS_API_KEY CESIUM_ION_TOKEN=$CESIUM_ION_TOKEN
RUN npx vite build

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PREVIEW_PORT=4173 TZ=America/Los_Angeles
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json /app/vite.config.js /app/index.html /app/style.css ./
COPY --from=build /app/src ./src
COPY --from=build /app/config ./config
COPY --from=build /app/public ./public
EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:4173/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
