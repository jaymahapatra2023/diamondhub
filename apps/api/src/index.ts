import { buildApp } from './app.js'
import { config } from './config.js'
import { logger } from './lib/logger.js'
import { prisma } from '@diamondhub/db'
import { redis } from './lib/redis.js'
import { setupSocket } from './lib/socket.js'

async function main() {
  const app = await buildApp()
  await redis.connect()
  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  // Socket.io setup must happen after listen() so app.server is bound
  setupSocket(app)
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'DiamondHub API started')
  logger.info('Socket.io server ready')
}

main().catch((err) => {
  logger.error(err, 'Fatal startup error')
  process.exit(1)
})

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully')
  await prisma.$disconnect()
  await redis.quit()
  process.exit(0)
})

process.on('SIGINT', async () => {
  await prisma.$disconnect()
  await redis.quit()
  process.exit(0)
})
