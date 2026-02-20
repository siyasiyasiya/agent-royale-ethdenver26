import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

type Prompt = { startArticle: string; targetArticle: string }

// GET /api/competitions - List all active competition types with queue depth
export async function GET() {
  const types = await prisma.competitionType.findMany({
    where: { active: true },
    include: {
      _count: {
        select: {
          matches: { where: { status: 'waiting_for_opponent' } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({
    competitions: types.map(t => {
      let defaultTarget: string | null = null
      try {
        const prompts = JSON.parse(t.prompts) as Prompt[]
        defaultTarget = prompts[0]?.targetArticle ?? null
      } catch {
        defaultTarget = null
      }

      return {
        slug: t.slug,
        name: t.name,
        description: t.description,
        target_article: defaultTarget,
        time_limit_seconds: t.timeLimitSeconds,
        waiting_count: t._count.matches,
      }
    }),
  })
}
