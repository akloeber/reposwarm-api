import { logger } from '../middleware/logger.js'

export interface DiscoveredRepo {
  name: string
  url: string
  source: string
}

export async function discoverRepos(): Promise<DiscoveredRepo[]> {
  const pat = process.env.AZURE_DEVOPS_PAT
  const org = process.env.AZURE_DEVOPS_ORG
  if (!pat) {
    throw new Error('AZURE_DEVOPS_PAT not set. Run: reposwarm config git setup')
  }
  if (!org) {
    throw new Error('AZURE_DEVOPS_ORG not set. Run: reposwarm config git setup')
  }

  // Basic auth: empty username, PAT as password
  const credentials = Buffer.from(`:${pat}`).toString('base64')
  const headers: Record<string, string> = {
    Authorization: `Basic ${credentials}`,
    'User-Agent': 'RepoSwarm'
  }

  const repos: DiscoveredRepo[] = []
  // Azure DevOps paginates via $skip
  let skip = 0
  const top = 100

  while (true) {
    const url = `https://dev.azure.com/${encodeURIComponent(org)}/_apis/git/repositories?api-version=7.0&$top=${top}&$skip=${skip}`
    const res = await fetch(url, { headers })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Azure DevOps API error ${res.status}: ${body}`)
    }
    const data = await res.json() as { value: Array<{ name: string; remoteUrl: string }>; count: number }
    const items = data.value || []
    if (items.length === 0) break
    for (const r of items) {
      repos.push({ name: r.name, url: r.remoteUrl, source: 'AzureDevOps' })
    }
    if (items.length < top) break
    skip += top
  }

  logger.info({ count: repos.length, org }, 'Azure DevOps discovery complete')
  return repos
}
