FROM node:24.18.0-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY protocols ./protocols
COPY tsconfig.base.json ./
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24.18.0-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/protocols ./protocols

USER node
EXPOSE 3000
CMD ["node", "apps/research-mcp/dist/index.js"]
