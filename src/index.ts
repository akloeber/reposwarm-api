import { createApp } from './app.js'
import { config } from './config.js'
import { logger } from './middleware/logger.js'

const app = createApp()

app.listen(config.port, () => {
  logger.info({ port: config.port }, 'RepoSwarm API server started')
})
