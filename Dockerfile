FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build

WORKDIR /app
COPY package*.json ./
COPY apps ./apps
COPY packages ./packages
COPY protocols ./protocols
COPY integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md ./integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md
COPY tsconfig.base.json ./
RUN npm ci
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runtime

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/protocols ./protocols
COPY --from=build /app/integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md ./integrations/gemini-spark/scout-youtube-for-askrigor-staged/SKILL.md

USER node
EXPOSE 3000
CMD ["node", "apps/research-mcp/dist/index.js"]
