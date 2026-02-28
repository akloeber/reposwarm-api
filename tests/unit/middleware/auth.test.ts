import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'

process.env.API_BEARER_TOKEN = 'test-token-xyz'
process.env.LOG_LEVEL = 'silent'

const { mockVerify } = vi.hoisted(() => {
  const mockVerify = vi.fn()
  return { mockVerify }
})

vi.mock('aws-jwt-verify', () => ({
  CognitoJwtVerifier: {
    create: vi.fn().mockReturnValue({ verify: mockVerify })
  }
}))

import { authMiddleware, resetVerifier } from '../../../src/middleware/auth.js'

function mockReqRes(authHeader?: string) {
  const req = { headers: { authorization: authHeader } } as any as Request
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any as Response
  const next = vi.fn() as NextFunction
  return { req, res, next }
}

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetVerifier()
    mockVerify.mockRejectedValue(new Error('Invalid token'))
  })

  it('rejects missing Authorization header', async () => {
    const { req, res, next } = mockReqRes()
    await authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects non-Bearer auth', async () => {
    const { req, res, next } = mockReqRes('Basic abc123')
    await authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('accepts valid Cognito JWT', async () => {
    mockVerify.mockResolvedValueOnce({ sub: 'user-123', email: 'test@test.com' })
    const { req, res, next } = mockReqRes('Bearer valid-jwt')
    await authMiddleware(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual({ sub: 'user-123', email: 'test@test.com', type: 'cognito' })
  })

  it('falls back to bearer token when JWT fails', async () => {
    mockVerify.mockRejectedValueOnce(new Error('bad jwt'))
    const { req, res, next } = mockReqRes('Bearer test-token-xyz')
    await authMiddleware(req, res, next)
    expect(next).toHaveBeenCalled()
    expect(req.user).toEqual({ sub: 'api-token', type: 'm2m' })
  })

  it('rejects invalid token', async () => {
    mockVerify.mockRejectedValueOnce(new Error('bad'))
    const { req, res, next } = mockReqRes('Bearer wrong-token')
    await authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('rejects empty bearer token', async () => {
    const { req, res, next } = mockReqRes('Bearer ')
    await authMiddleware(req, res, next)
    expect(res.status).toHaveBeenCalledWith(401)
  })
})
