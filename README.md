# Relay

Relay is a webhook delivery platform built with Next.js, Express, Drizzle,
Neon PostgreSQL, Redis, and BullMQ.

## Local services

Relay uses:

- Neon PostgreSQL for projects, events, endpoints, delivery runs, attempts,
  and the dispatch outbox.
- Redis for BullMQ job transport.
- Express on port `4000` for the API.
- Next.js on port `3000` for the control-plane dashboard.

Copy `.env.example` to `.env` and provide real values. Never commit `.env`.
`RELAY_SECRET_ENCRYPTION_KEY` must be a base64 value that decodes to exactly
32 random bytes. For example, generate one with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Apply database migrations with:

```bash
npm run db:migrate
```

Run the API and dashboard separately:

```bash
npx tsx server/index.ts
npm run dev
```

Run the delivery worker after Redis is available:

```bash
npm run worker
```

The worker reads `REDIS_URL`, `RELAY_MAX_ATTEMPTS`,
`RELAY_RETRY_BASE_DELAY_MS`, `RELAY_LEASE_DURATION_MS`, and
`RELAY_WEBHOOK_TIMEOUT_MS` from the environment. It claims authoritative
delivery runs from PostgreSQL before sending a signed webhook.

## Authentication

Set `RELAY_AUTH_REQUIRED=true` outside local development. An admin creates a
project API key through:

```text
POST /api/projects/:projectId/api-keys
X-Relay-Admin-Key: <RELAY_ADMIN_KEY>
```

The raw project key is returned once. Store it securely and send it on future
project requests as `X-Relay-API-Key` or `Authorization: Bearer <key>`.
Only the SHA-256 hash is stored in PostgreSQL, and the key is scoped to its
project.

## Verification

```bash
npm test
npx tsc --noEmit --incremental false --pretty false
npm run lint
npm run build
```

The build script uses Next.js webpack mode because the default Turbopack build
has an environment-specific CSS worker panic in this workspace. The optional
`npm run build:turbopack` script remains available for testing that path.
