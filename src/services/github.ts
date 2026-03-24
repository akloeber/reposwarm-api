import { logger } from '../middleware/logger.js'

export interface DiscoveredRepo {
  name: string
  url: string
  source: string
}

export async function discoverRepos(org?: string): Promise<DiscoveredRepo[]> {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN not set. Run: reposwarm config git setup')
  }

  const headers: Record<string, string> = {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'RepoSwarm'
  }

  const repos: DiscoveredRepo[] = []

  if (org) {
    // Org repos
    let page = 1
    while (true) {
      const url = `https://api.github.com/orgs/${encodeURIComponent(org)}/repos?per_page=100&page=${page}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`GitHub API error ${res.status}: ${body}`)
      }
      const data = await res.json() as Array<{ name: string; clone_url: string }>
      if (!Array.isArray(data) || data.length === 0) break
      for (const r of data) {
        repos.push({ name: r.name, url: r.clone_url, source: 'GitHub' })
      }
      if (data.length < 100) break
      page++
    }
  } else {
    // Authenticated user repos
    let page = 1
    while (true) {
      const url = `https://api.github.com/user/repos?per_page=100&type=all&page=${page}`
      const res = await fetch(url, { headers })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`GitHub API error ${res.status}: ${body}`)
      }
      const data = await res.json() as Array<{ name: string; clone_url: string }>
      if (!Array.isArray(data) || data.length === 0) break
      for (const r of data) {
        repos.push({ name: r.name, url: r.clone_url, source: 'GitHub' })
      }
      if (data.length < 100) break
      page++
    }
  }

  logger.info({ count: repos.length, org: org || '(user)' }, 'GitHub discovery complete')
  return repos
}
