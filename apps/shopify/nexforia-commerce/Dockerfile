FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN corepack enable && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

CMD ["pnpm", "run", "start"]
