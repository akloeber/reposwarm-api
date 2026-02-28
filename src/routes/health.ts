import { Router } from 'express'
import * as dynamodb from '../services/dynamodb.js'
import * as temporal from '../services/temporal.js'
import { config } from '../config.js'

const router = Router()

router.get('/health', async (_req, res) => {
  const [dynHealth, tempHealth] = await Promise.all([
    dynamodb.healthCheck(),
    temporal.healthCheck()
  ])
  res.json({
    data: {
      status: dynHealth && tempHealth ? 'healthy' : 'degraded',
      version: config.version,
      temporal: { connected: tempHealth },
      dynamodb: { connected: dynHealth }
    }
  })
})

export default router
