FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# Install dependencies inside the container (never copy host node_modules)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY sandbox/package.json ./sandbox/

RUN pnpm install --filter @integraguard/sandbox... --frozen-lockfile

# Copy only source/config — not node_modules or dist
COPY sandbox/tsconfig.json ./sandbox/
COPY sandbox/src ./sandbox/src
COPY scenarios ./scenarios

WORKDIR /app/sandbox
EXPOSE 4000

CMD ["pnpm", "start"]
