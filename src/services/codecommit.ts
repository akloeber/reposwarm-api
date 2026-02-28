import { CodeCommitClient, ListRepositoriesCommand, BatchGetRepositoriesCommand } from '@aws-sdk/client-codecommit'
import { config } from '../config.js'
import { logger } from '../middleware/logger.js'

const client = new CodeCommitClient({ region: config.region })

export async function discoverRepos(): Promise<{ name: string; url: string; source: string }[]> {
  const listRes = await client.send(new ListRepositoriesCommand({}))
  const repoNames = (listRes.repositories || []).map(r => r.repositoryName!).filter(Boolean)

  const repos: { name: string; url: string; source: string }[] = []
  // BatchGetRepositories max 25 per call
  for (let i = 0; i < repoNames.length; i += 25) {
    const batch = repoNames.slice(i, i + 25)
    try {
      const batchRes = await client.send(new BatchGetRepositoriesCommand({ repositoryNames: batch }))
      for (const repo of batchRes.repositories || []) {
        repos.push({
          name: repo.repositoryName || '',
          url: repo.cloneUrlHttp || '',
          source: 'CodeCommit'
        })
      }
    } catch (e) {
      logger.error({ err: e, batch: i }, 'BatchGetRepositories failed')
    }
  }
  return repos
}
