import { Router, Request, Response } from 'express'
import { config } from '../config.js'
import { logger } from '../middleware/logger.js'
import { WorkerInfo, EnvEntry } from '../types/index.js'
import { execSync, spawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import os from 'os'

const router = Router()
const INSTALL_DIR = process.env.REPOSWARM_INSTALL_DIR || join(os.homedir(), 'reposwarm')

// Known required env vars for workers
const REQUIRED_ENV_VARS = [
  { key: 'ANTHROPIC_API_KEY', desc: 'required for LLM calls', alts: [] },
  { key: 'GITHUB_TOKEN', desc: 'required for repo access', alts: ['GITHUB_PAT'] },
]

const KNOWN_ENV_VARS = [
  'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_PAT',
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_DEFAULT_REGION',
  'CLAUDE_MODEL', 'MODEL_ID', 'MODEL', 'ANTHROPIC_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL', 'CLAUDE_CODE_USE_BEDROCK',
  'TEMPORAL_SERVER_URL', 'DYNAMODB_TABLE_NAME',
  'API_BEARER_TOKEN',
]

// ─── Helpers ────────────────────────────────────────────────────

function workerEnvPath(): string {
  return join(INSTALL_DIR, 'worker', '.env')
}

function readEnvFile(path: string): Record<string, string> {
  const vars: Record<string, string> = {}
  if (!existsSync(path)) return vars
  const content = readFileSync(path, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      vars[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1).trim()
    }
  }
  return vars
}

function writeEnvFile(path: string, vars: Record<string, string>): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Preserve comments and order from existing file
  const lines: string[] = []
  const written = new Set<string>()

  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf-8').split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed) {
        lines.push(line)
        continue
      }
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx)
        if (key in vars) {
          lines.push(`${key}=${vars[key]}`)
          written.add(key)
        }
        // else: key was unset, skip it
      }
    }
  }

  // Append new keys
  for (const [key, val] of Object.entries(vars)) {
    if (!written.has(key)) {
      lines.push(`${key}=${val}`)
    }
  }

  // Clean trailing empty lines
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  writeFileSync(path, lines.join('\n') + '\n', { mode: 0o600 })
}

function findPID(service: string): number {
  const patterns: Record<string, string[]> = {
    api: ['node.*reposwarm-api', 'node.*dist/index'],
    worker: ['python.*src.worker', 'python.*worker'],
    temporal: ['temporal-server'],
    ui: ['next-server', 'node.*reposwarm-ui'],
  }
  for (const pattern of (patterns[service] || [])) {
    try {
      const out = execSync(`pgrep -f '${pattern}'`, { encoding: 'utf-8', timeout: 3000 }).trim()
      const pid = parseInt(out.split('\n')[0])
      if (pid > 0) return pid
    } catch { /* not found */ }
  }
  return 0
}

function isProcessRunning(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

function readLogTail(service: string, lines: number): string[] {
  const candidates = [
    join(INSTALL_DIR, 'logs', `${service}.log`),
    join(INSTALL_DIR, service, `${service}.log`),
  ]
  for (const logFile of candidates) {
    if (!existsSync(logFile)) continue
    const content = readFileSync(logFile, 'utf-8')
    const allLines = content.split('\n').filter(l => l.trim())
    return allLines.slice(-lines)
  }
  return []
}

function gatherWorkers(): WorkerInfo[] {
  const envPath = workerEnvPath()
  const envVars = readEnvFile(envPath)
  const hostname = os.hostname()

  // Check env validation
  const envErrors: string[] = []
  for (const req of REQUIRED_ENV_VARS) {
    const found = envVars[req.key] || process.env[req.key] ||
      req.alts.some(alt => envVars[alt] || process.env[alt])
    if (!found) envErrors.push(req.key)
  }

  const pid = findPID('worker')
  let status: WorkerInfo['status'] = 'stopped'
  if (pid > 0 && isProcessRunning(pid)) {
    status = envErrors.length > 0 ? 'failed' : 'healthy'
  }

  // Check logs for validation errors
  if (status === 'healthy') {
    const recentLogs = readLogTail('worker', 20)
    const hasValidationError = recentLogs.some(l =>
      l.toLowerCase().includes('validation failed') || l.toLowerCase().includes('critical'))
    if (hasValidationError) status = 'degraded'
  }

  // Detect model
  const model = envVars['ANTHROPIC_MODEL'] || envVars['CLAUDE_MODEL'] || envVars['MODEL_ID'] || ''

  const worker: WorkerInfo = {
    name: 'worker-1',
    identity: 'investigate-worker-1',
    status,
    taskQueue: config.temporalTaskQueue,
    envStatus: envErrors.length > 0 ? `${envErrors.length} errors` : 'OK',
    envErrors,
    pid: pid || undefined,
    host: hostname,
    model,
  }

  return [worker]
}

// ─── Routes ─────────────────────────────────────────────────────

// GET /workers
router.get('/workers', async (_req: Request, res: Response) => {
  const workers = gatherWorkers()
  const healthy = workers.filter(w => w.status === 'healthy').length
  res.json({ data: { workers, total: workers.length, healthy } })
})

// GET /workers/:id
router.get('/workers/:id', async (req: Request, res: Response) => {
  const workers = gatherWorkers()
  const id = req.params.id as string
  const worker = workers.find(w => w.name === id || w.identity === id)
  if (!worker) return res.status(404).json({ error: `Worker '${id}' not found` })
  res.json({ data: worker })
})

// GET /workers/:id/env
router.get('/workers/:id/env', async (req: Request, res: Response) => {
  const reveal = req.query.reveal === 'true'
  const envPath = workerEnvPath()
  const fileVars = readEnvFile(envPath)

  const seen = new Set<string>()
  const entries: EnvEntry[] = []

  const addEntry = (key: string) => {
    if (seen.has(key)) return
    seen.add(key)

    let value = '', source = '—', set = false
    if (fileVars[key]) {
      value = fileVars[key]; source = '.env'; set = true
    } else if (process.env[key]) {
      value = process.env[key]!; source = 'environment'; set = true
    }

    if (!reveal && set && value.length > 8) {
      value = value.slice(0, 4) + '...' + value.slice(-4)
    } else if (!reveal && set) {
      value = '***'
    }
    if (!set) value = '(not set)'

    entries.push({ key, value, source, set })
  }

  for (const k of KNOWN_ENV_VARS) addEntry(k)
  for (const k of Object.keys(fileVars)) addEntry(k)

  res.json({ data: { envFile: envPath, entries } })
})

// PUT /workers/:id/env/:key
router.put('/workers/:id/env/:key', async (req: Request, res: Response) => {
  const key = req.params.key as string
  const { value } = req.body
  if (!value) return res.status(400).json({ error: 'value is required' })

  const envPath = workerEnvPath()
  const vars = readEnvFile(envPath)
  vars[key] = value
  writeEnvFile(envPath, vars)

  const masked = value.length > 8 ? value.slice(0, 4) + '...' + value.slice(-4) : '***'
  logger.info({ key, envPath }, 'Worker env var set')
  res.json({ data: { key, value: masked, envFile: envPath } })
})

// DELETE /workers/:id/env/:key
router.delete('/workers/:id/env/:key', async (req: Request, res: Response) => {
  const key = req.params.key as string
  const envPath = workerEnvPath()
  const vars = readEnvFile(envPath)
  delete vars[key]
  writeEnvFile(envPath, vars)

  logger.info({ key, envPath }, 'Worker env var removed')
  res.json({ data: { key, removed: true, envFile: envPath } })
})

// POST /workers/:id/restart
router.post('/workers/:id/restart', async (req: Request, res: Response) => {
  const pid = findPID('worker')
  if (pid > 0) {
    try { process.kill(pid, 'SIGTERM') } catch { /* already dead */ }
    // Wait for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (isProcessRunning(pid)) {
      try { process.kill(pid, 'SIGKILL') } catch { /* */ }
    }
  }

  // Start worker
  const workerDir = join(INSTALL_DIR, 'worker')
  const envVars = readEnvFile(join(workerDir, '.env'))
  const env = { ...process.env, ...envVars }

  try {
    const child = spawn('python3', ['-m', 'src.worker'], {
      cwd: workerDir, env, detached: true, stdio: 'ignore'
    })
    child.unref()

    const newPid = child.pid || 0
    logger.info({ pid: newPid }, 'Worker restarted')
    res.json({ data: { service: 'worker', status: 'restarted', pid: newPid } })
  } catch (err: any) {
    res.status(500).json({ error: `Failed to start worker: ${err.message}` })
  }
})

export default router
