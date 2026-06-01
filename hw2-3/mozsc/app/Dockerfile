# The backend was developed on node v22.10.0
FROM node:22-alpine AS base

RUN apk add --no-cache python3 py3-setuptools make g++

WORKDIR /app
COPY . .

# prepare pnpm (install)
FROM base AS pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM pnpm AS prod-deps
# only download production dependencies
# no build tool !!
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM pnpm AS build
# download development dependencies and build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base
# copy production dependencies and build result
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

EXPOSE 8080

CMD [ "node", "--enable-source-maps", "." ]