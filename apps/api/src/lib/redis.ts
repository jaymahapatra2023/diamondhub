import IORedis from 'ioredis'
import { config } from '../config.js'
import { logger } from './logger.js'

export const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('error', (err) => logger.error({ err }, 'Redis connection error'))
redis.on('connect', () => logger.info('Redis connected'))
redis.on('ready', () => logger.info('Redis ready'))
