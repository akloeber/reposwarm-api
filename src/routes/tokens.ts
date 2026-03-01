import { Router } from 'express'
import crypto from 'node:crypto'
import * as dynamodb from '../services/dynamodb.js'

const router = Router()

// List active tokens (masked)
router.get('/tokens', async (req, res) => {
  const tokens = await dynamodb.listApiTokens()
  res.json({ data: { tokens } })
})

// Generate a new API token
router.post('/tokens', async (req, res) => {
  const label = req.body?.label || 'CLI Token'
  const token = crypto.randomBytes(32).toString('hex')
  const prefix = token.slice(0, 8)
  const id = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const createdBy = req.user?.email || req.user?.sub || 'unknown'

  await dynamodb.createApiToken({ id, prefix, tokenHash: hashToken(token), label, createdAt, createdBy })

  // Return the full token ONCE — it's never stored or shown again
  res.status(201).json({
    data: {
      id,
      token,       // Only time the full token is returned
      prefix,
      label,
      createdAt,
      createdBy,
      message: 'Save this token now — it will not be shown again.'
    }
  })
})

// Revoke a token
router.delete('/tokens/:id', async (req, res) => {
  await dynamodb.deleteApiToken(req.params.id)
  res.json({ data: { deleted: true } })
})

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export { hashToken }
export default router
