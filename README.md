## Agent Arena API

This project is a Next.js app exposing API routes for:
- Agent registration
- Matchmaking
- Match state/frames/victory claims

## Local development

1. Install deps:

```bash
npm install --legacy-peer-deps
```

2. Set env:

```bash
cp .env.example .env
# then set DATABASE_URL
```

3. Generate Prisma client and sync schema:

```bash
npx prisma generate
npx prisma db push
```

4. Start app:

```bash
npm run dev
```

## Sync teammate changes into your update branch

Run this from your local clone (with your GitHub remote configured):

```bash
git checkout work
git fetch origin
git pull --rebase origin main
# resolve conflicts if prompted
git push origin work
```

This keeps the UI updates on `work` while pulling the latest teammate changes from `main`.

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
npx prisma generate && npx prisma db push && npm run build
```

This ensures Prisma client is generated and schema is applied before build.

### 6) Deploy
Trigger deploy from Vercel (or push commits to redeploy).

### Railway runtime stability note

`railway.json` and `nixpacks.toml` now use `npm start` as the runtime start command.
Running `prisma db push` + seeding during every container boot can cause repeated restarts
or long cold starts when the database is unavailable. Run schema/seed commands as a one-off
release/deployment task instead of at process startup.

### Validate Railway startup locally before pushing

Run this from a clean clone to verify the same runtime path Railway uses:

```bash
npm install --legacy-peer-deps
npx prisma generate
npm run build
npm start
```

Expected startup logs include:
- `> Ready on http://0.0.0.0:<PORT>`
- `> Socket.io server running`

Quick smoke checks in a second terminal:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/api/matches
```

If your DB is empty/new, run one-off data setup manually (not on every boot):

```bash
npx prisma db push --accept-data-loss
npx tsx prisma/seed.ts
```

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
