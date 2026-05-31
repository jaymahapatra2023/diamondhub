// P12: Structured JSON logging via pino. Never console.log in production.
import pino from 'pino'
import { config } from '../config.js'

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : 'info',
  ...(config.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  }),
  redact: {
    paths: [
      'req.headers.authorization',
      'body.password',
      'body.token',
      'body.idToken',
      '*.tokenHash',
      '*.passwordHash',
    ],
    censor: '[REDACTED]',
  },
})
