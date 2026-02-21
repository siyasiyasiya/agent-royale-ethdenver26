import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const PROMPTS = [
  // EASY - target is 1-2 clicks away
  { startArticle: '/wiki/Science', targetArticle: 'Physics' },
  { startArticle: '/wiki/Europe', targetArticle: 'Germany' },
  { startArticle: '/wiki/Music', targetArticle: 'Jazz' },
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
