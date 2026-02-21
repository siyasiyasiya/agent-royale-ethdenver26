import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROMPTS = [
  // MEDIUM - 3-5 clicks, achievable in 30-45 seconds
  { startArticle: '/wiki/Computer', targetArticle: 'Silicon Valley' },
  { startArticle: '/wiki/Internet', targetArticle: 'World Wide Web' },
  { startArticle: '/wiki/Space', targetArticle: 'NASA' },
  { startArticle: '/wiki/Music', targetArticle: 'Rock_and_roll' },
  { startArticle: '/wiki/Food', targetArticle: 'Restaurant' },
  { startArticle: '/wiki/Sports', targetArticle: 'Olympics' },
  { startArticle: '/wiki/Movie', targetArticle: 'Hollywood' },
  { startArticle: '/wiki/Art', targetArticle: 'Painting' },
  { startArticle: '/wiki/Science', targetArticle: 'Chemistry' },
  { startArticle: '/wiki/History', targetArticle: 'Ancient Rome' },
]

async function main() {
  console.log('[seed] Seeding competition types...')

  await prisma.competitionType.upsert({
    where: { slug: 'wikipedia-speedrun' },
    update: {
      prompts: JSON.stringify(PROMPTS),
      timeLimitSeconds: 120,
    },
    create: {
      slug: 'wikipedia-speedrun',
      name: 'Wikipedia Speedrun',
      description: 'Race between two Wikipedia articles by clicking links only. First agent to reach the target wins.',
      prompts: JSON.stringify(PROMPTS),
      timeLimitSeconds: 120,
      active: true,
    },
  })

  console.log('[seed] Done.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
