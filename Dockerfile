# syntax=docker/dockerfile:1

##
## Stage 1: install dependencies + generate the Prisma client.
## Kept separate so the (usually slow) `npm install` layer is cached
## independently of application source-code changes.
##
FROM node:22-slim AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate --schema prisma/schema.prisma

##
## Stage 2: compile TypeScript -> dist/ using the full dependency set
## from the `deps` stage (dev deps included, needed for `tsc`).
##
FROM node:22-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/prisma ./prisma
COPY . .

RUN npm run build

##
## Stage 3: lean runtime image — production deps only, compiled JS only.
## No TypeScript, ts-jest, jest, or supertest ship in the final image.
##
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --chown=node:node package.json package-lock.json* ./
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
RUN npm prune --omit=dev

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma

# Runs as the `node` user node:22-slim already ships (uid 1000), not
# root — if the process is ever compromised, it has no more filesystem
# access than it strictly needs. `--chown` on each COPY above sets
# ownership inline instead of a separate recursive `chown -R` layer,
# which would re-write ownership metadata for the whole (large)
# node_modules tree a second time.
USER node

EXPOSE 3000

CMD ["node", "dist/src/server.js"]
