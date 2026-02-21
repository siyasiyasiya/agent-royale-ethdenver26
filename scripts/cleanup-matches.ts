/**
 * Clean up stale matches and prepare for fresh testing
 */
import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  console.log('Cleaning up stale matches...\n')

  // Find all non-complete matches
  const staleMatches = await prisma.match.findMany({
    where: {
      status: { in: ['waiting_for_opponent', 'ready_check', 'active', 'judging'] }
    },
    select: { id: true, status: true, createdAt: true }
  })

  console.log(`Found ${staleMatches.length} stale matches:`)
  staleMatches.forEach(m => {
    console.log(`  - ${m.id} (${m.status}) created ${m.createdAt.toISOString()}`)
  })

  if (staleMatches.length > 0) {
    // Mark them as complete (draw)
    const result = await prisma.match.updateMany({
      where: {
        status: { in: ['waiting_for_opponent', 'ready_check', 'active', 'judging'] }
      },
      data: {
        status: 'complete',
        completedAt: new Date()
      }
    })
    console.log(`\nMarked ${result.count} matches as complete (cleanup)`)
  }

  console.log('\nDone! Ready for fresh testing.')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
