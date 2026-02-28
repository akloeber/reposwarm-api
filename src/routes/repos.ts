import { Router } from 'express'
import * as dynamodb from '../services/dynamodb.js'
import * as codecommit from '../services/codecommit.js'

const router = Router()

router.get('/repos', async (_req, res) => {
  const repos = await dynamodb.listRepos()
  res.json({ data: repos })
})

router.post('/repos', async (req, res) => {
  const { name, url, source, enabled } = req.body
  if (!name || !url) {
    res.status(400).json({ error: 'name and url are required' })
    return
  }
  await dynamodb.putRepo({ name, url, source, enabled })
  res.status(201).json({ data: { name, url, source: source || 'GitHub', enabled: enabled !== false } })
})

router.get('/repos/:name', async (req, res) => {
  const repo = await dynamodb.getRepo(req.params.name)
  if (!repo) { res.status(404).json({ error: 'Repository not found' }); return }
  res.json({ data: repo })
})

router.put('/repos/:name', async (req, res) => {
  const repo = await dynamodb.getRepo(req.params.name)
  if (!repo) { res.status(404).json({ error: 'Repository not found' }); return }
  await dynamodb.updateRepo(req.params.name, req.body)
  res.json({ data: { ...repo, ...req.body } })
})

router.delete('/repos/:name', async (req, res) => {
  await dynamodb.deleteRepo(req.params.name)
  res.json({ data: { deleted: true } })
})

router.post('/repos/discover', async (_req, res) => {
  const discovered = await codecommit.discoverRepos()
  const existing = await dynamodb.listRepos()
  const existingNames = new Set(existing.map(r => r.name))
  let added = 0
  for (const repo of discovered) {
    if (!existingNames.has(repo.name)) {
      await dynamodb.putRepo({ name: repo.name, url: repo.url, source: repo.source, enabled: true })
      added++
    }
  }
  res.json({ data: { discovered: discovered.length, added, skipped: discovered.length - added } })
})

export default router
