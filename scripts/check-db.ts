import { PrismaClient } from '@prisma/client'
import 'dotenv/config'

const prisma = new PrismaClient()

async function main() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, name: true, inftTokenId: true, claimed: true }
  })
  console.log('Recent agents:')
  console.log(JSON.stringify(agents, null, 2))

  // Check for duplicate inftTokenId = 4
  const tokenFour = await prisma.agent.findUnique({
    where: { inftTokenId: '4' }
  })
  if (tokenFour) {
    console.log('\nAgent with inftTokenId=4:')
    console.log(JSON.stringify(tokenFour, null, 2))
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
