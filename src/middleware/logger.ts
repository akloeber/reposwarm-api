import pino from 'pino'
import pinoHttp from 'pino-http'
import { config } from '../config.js'

export const logger = pino({ level: config.logLevel })
export const httpLogger = (pinoHttp as any).default
  ? (pinoHttp as any).default({ logger, autoLogging: { ignore: (req: any) => req.url === '/health' } })
  : (pinoHttp as any)({ logger, autoLogging: { ignore: (req: any) => req.url === '/health' } })
