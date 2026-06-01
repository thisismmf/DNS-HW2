# The backend was developed on node v22.10.0
FROM node:22-slim AS base

WORKDIR /app
COPY . .

# prepare pnpm (install)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS prod-deps
# only download production dependencies
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile
# Install chromium for playwright

FROM base AS build
# download development dependencies and build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

FROM base AS runtime
# copy production dependencies and build result
COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist

# Install playwright on the runtime
#RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpx playwright install --with-deps
RUN npx playwright install --with-deps chromium

CMD [ "node", "--enable-source-maps", "." ]