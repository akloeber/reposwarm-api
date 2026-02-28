import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { httpLogger } from './middleware/logger.js'
import { errorHandler } from './middleware/error-handler.js'
import { authMiddleware } from './middleware/auth.js'
import healthRouter from './routes/health.js'
import reposRouter from './routes/repos.js'
import workflowsRouter from './routes/workflows.js'
import investigateRouter from './routes/investigate.js'
import wikiRouter from './routes/wiki.js'
import promptsRouter from './routes/prompts.js'
import configRouter from './routes/config.js'

export function createApp() {
  const app = express()

  app.use(helmet())
  app.use(cors())
  app.use(express.json())
  app.use(httpLogger)

  // Unauthenticated routes
  app.use(healthRouter)

  // Authenticated routes
  app.use(authMiddleware)
  app.use(reposRouter)
  app.use(workflowsRouter)
  app.use(investigateRouter)
  app.use(wikiRouter)
  app.use(promptsRouter)
  app.use(configRouter)

  app.use(errorHandler)

  return app
}
