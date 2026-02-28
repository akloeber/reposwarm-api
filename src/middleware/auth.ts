import { Request, Response, NextFunction } from 'express'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import { config } from '../config.js'
import { logger } from './logger.js'

let cognitoVerifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null

function getVerifier() {
  if (!cognitoVerifier) {
    cognitoVerifier = CognitoJwtVerifier.create({
      userPoolId: config.cognitoUserPoolId,
      tokenUse: 'id',
      clientId: null as any
    })
  }
  return cognitoVerifier
}

function getBearerToken(): string {
  return process.env.API_BEARER_TOKEN || config.apiBearerToken || ''
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  if (!token) {
    res.status(401).json({ error: 'Empty token' })
    return
  }

  // Try Cognito JWT first
  try {
    const payload = await getVerifier().verify(token)
    req.user = {
      sub: payload.sub,
      email: payload.email as string | undefined,
      type: 'cognito'
    }
    return next()
  } catch {
    // Not a valid Cognito JWT
  }

  // Try static bearer token
  const bearerToken = getBearerToken()
  if (bearerToken && token === bearerToken) {
    req.user = { sub: 'api-token', type: 'm2m' }
    return next()
  }

  logger.warn('Authentication failed: invalid token')
  res.status(401).json({ error: 'Invalid or expired token' })
}

export function resetVerifier() {
  cognitoVerifier = null
}
