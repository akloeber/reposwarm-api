import { logger } from '../middleware/logger.js'

export interface DiscoveredRepo {
  name: string
  url: string
  source: string
}

export async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const username = process.env.BITBUCKET_USERNAME
  const appPassword = process.env.BITBUCKET_APP_PASSWORD
  if (!username) {
    throw new Error('BITBUCKET_USERNAME not set. Run: reposwarm config git setup')
  }
  if (!appPassword) {
    throw new Error('BITBUCKET_APP_PASSWORD not set. Run: reposwarm config git setup')
  }

  const credentials = Buffer.from(`${username}:${appPassword}`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
    'User-Agent': 'RepoSwarm'
  }

  const repos: DiscoveredRepo[] = []
  let nextUrl: string | null = `https://api.bitbucket.org/2.0/repositories/${encodeURIComponent(username)}?pagelen=100`

  while (nextUrl) {
    const res = await fetch(nextUrl, { headers })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Bitbucket API error ${res.status}: ${body}`)
    }
    const data = await res.json() as {
      values: Array<{ slug: string; links: { clone: Array<{ href: string; name: string }> } }>
      next?: string
    }
    const items = data.values || []
    for (const r of items) {
      // Find the HTTPS clone URL
      const httpsClone = r.links?.clone?.find(c => c.name === 'https')
      const cloneUrl = httpsClone?.href || `https://bitbucket.org/${username}/${r.slug}.git`
      repos.push({ name: r.slug, url: cloneUrl, source: 'Bitbucket' })
    }
    nextUrl = data.next || null
  }

  logger.info({ count: repos.length, username }, 'Bitbucket discovery complete')
  return repos
}
