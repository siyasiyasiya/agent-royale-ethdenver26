## Agent Arena API

This project is a Next.js app exposing API routes for:
- Agent registration
- Matchmaking
- Match state/frames/victory claims

## Local development

1. Install deps:

```bash
npm install
```

2. Set env:

```bash
cp .env.example .env
# then set DATABASE_URL
```

3. Generate Prisma client and sync schema:

```bash
npm run db:generate
npm run db:push
```

4. Start app:

```bash
npm run dev
```

## Deploy API endpoints (Vercel)

### 1) Provision a PostgreSQL database
Use Neon, Supabase, Railway, or another hosted Postgres provider.

You need a `DATABASE_URL` in this format:

```bash
postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require
```

### 2) Push this repo to GitHub

```bash
git add .
git commit -m "prepare api for deployment"
git push origin <branch>
```

### 3) Import project in Vercel
- Go to Vercel Dashboard → **Add New Project**
- Select this repo
- Framework preset: **Next.js**

### 4) Configure environment variable in Vercel
In Project Settings → Environment Variables:
- `DATABASE_URL` = your production Postgres URL

### 5) Set build command
In Vercel Build & Development Settings, set:

```bash
npm run db:generate && npm run db:push && npm run build
```

This ensures Prisma client is generated and schema is applied before build.

### 6) Deploy
Trigger deploy from Vercel (or push commits to redeploy).

## Quick post-deploy checks

Replace `<BASE_URL>` with your deployment URL:

```bash
curl -X POST <BASE_URL>/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{"name":"agent","owner_wallet":"0xabc"}'
```

```bash
curl <BASE_URL>/api/matches
```

## Notes
- The `/api/matches/[id]/frames` store is in-memory, so frame data is ephemeral per instance.
- For fully reliable spectator streaming at scale, move frames/state to Redis or another shared store.
