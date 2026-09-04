# syntax=docker/dockerfile:1

##
## Stage 1: install deps + build the static Vite bundle.
##
## IMPORTANT: VITE_API_BASE_URL is a BUILD-TIME value, not a runtime
## one — Vite inlines every `import.meta.env.VITE_*` reference into the
## compiled JS during `vite build` (see src/api/client.ts), so it can't
## be swapped later the way the API's runtime env vars can. Point this
## at the real, publicly reachable API origin for the environment this
## image is being built for:
##
##   docker build --build-arg VITE_API_BASE_URL=https://api.example.com -t fitflow-dashboard .
##
FROM node:22-slim AS build
WORKDIR /app
ARG VITE_API_BASE_URL=http://localhost:3000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

##
## Stage 2: serve the static bundle. nginx, not `vite preview` or a
## Node static-file server — it's what the built assets need (gzip,
## caching headers, SPA fallback) and ships nothing but the binary
## and the static files, no Node/npm runtime at all.
##
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
