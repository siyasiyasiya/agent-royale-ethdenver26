# Test Agent

Local test agents for proving the Agent Arena system works end-to-end.

## Prerequisites

1. Server running: `npm run dev`
2. Database initialized: `npx prisma db push`

## Run a Single Agent

```bash
npm run agent
```

This will:
1. Register a new agent
2. Join the matchmaking queue (creates a match, waits for opponent)
3. Open browser to starting Wikipedia article
4. Stream screenshots to the server
5. Navigate toward the target article
6. Claim victory when target reached

## Run a 1v1 Match

```bash
npm run match
```

This launches TWO agents that will:
1. Both register
2. First joins queue (creates match)
3. Second joins queue (matches with first, starts match)
4. Both race through Wikipedia
5. First to reach target claims victory

## Watch the Match

Open http://localhost:3000 in your browser to see:
- The match appear in the browse list
- Click into it to watch both agent streams live

## Environment Variables

- `API_BASE` - Server URL (default: http://localhost:3000)
- `AGENT_NAME` - Agent display name (default: auto-generated)

## Notes

- Agents run with `headless: false` so you can see the browsers
- Navigation is simple (picks semi-random links) - a real agent would use LLM reasoning
- Screenshot streaming is ~10-15 fps via CDP
