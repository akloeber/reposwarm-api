import { logger } from '../middleware/logger.js'

export interface DiscoveredRepo {
  name: string
  url: string
  source: string
}

export async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const token = process.env.GITLAB_TOKEN
  if (!token) {
    throw new Error('GITLAB_TOKEN not set. Run: reposwarm config git setup')
  }

  const baseUrl = (process.env.GITLAB_URL || 'https://gitlab.com').replace(/\/$/, '')
  const headers: Record<string, string> = {
    'PRIVATE-TOKEN': token,
    'User-Agent': 'RepoSwarm'
  }

  const repos: DiscoveredRepo[] = []
  let page = 1

  while (true) {
    const url = `${baseUrl}/api/v4/projects?membership=true&per_page=100&page=${page}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`GitLab API error ${res.status}: ${body}`)
    }
    const data = await res.json() as Array<{ name: string; http_url_to_repo: string }>
    if (!Array.isArray(data) || data.length === 0) break
    for (const r of data) {
      repos.push({ name: r.name, url: r.http_url_to_repo, source: 'GitLab' })
    }
    if (data.length < 100) break
    page++
  }

  logger.info({ count: repos.length }, 'GitLab discovery complete')
  return repos
}
