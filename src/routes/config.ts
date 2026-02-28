import { Router } from 'express'
import * as dynamodb from '../services/dynamodb.js'

const router = Router()

router.get('/config', async (_req, res) => {
  const cfg = await dynamodb.getConfig()
  res.json({ data: cfg })
})

router.put('/config', async (req, res) => {
  await dynamodb.putConfig(req.body)
  const cfg = await dynamodb.getConfig()
  res.json({ data: cfg })
})

export default router
