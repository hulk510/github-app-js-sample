import { createNodeMiddleware } from '@octokit/webhooks'
import dotenv from 'dotenv'
import fs from 'fs'
import http from 'http'
import { App, Octokit } from 'octokit'

// Load environment variables from .env file
dotenv.config()

// Set configured values
const appId = process.env.APP_ID
const privateKey = process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
const secret = process.env.WEBHOOK_SECRET
const enterpriseHostname = process.env.ENTERPRISE_HOSTNAME
const messageForNewPRs = fs.readFileSync('./message.md', 'utf8')

// Create an authenticated Octokit client authenticated as a GitHub App
const app = new App({
  appId,
  privateKey,
  webhooks: {
    secret
  },
  ...(enterpriseHostname && {
    Octokit: Octokit.defaults({
      baseUrl: `https://${enterpriseHostname}/api/v3`
    })
  })
})

// Optional: Get & log the authenticated app's name
const { data } = await app.octokit.request('/app')

// Read more about custom logging: https://github.com/octokit/core.js#logging
app.octokit.log.debug(`Authenticated as '${data.name}'`)

// Subscribe to the "pull_request.opened" webhook event
app.webhooks.on('pull_request.opened', async ({ octokit, payload }) => {
  console.log(
    `Received a pull request event for #${payload.pull_request.number}`
  )
  try {
    await octokit.rest.issues.createComment({
      owner: payload.repository.owner.login,
      repo: payload.repository.name,
      issue_number: payload.pull_request.number,
      body: messageForNewPRs
    })
  } catch (error) {
    if (error.response) {
      console.error(
        `Error! Status: ${error.response.status}. Message: ${error.response.data.message}`
      )
    } else {
      console.error(error)
    }
  }
})

// Optional: Handle errors
app.webhooks.onError((error) => {
  if (error.name === 'AggregateError') {
    // Log Secret verification errors
    console.log(`Error processing request: ${error.event}`)
  } else {
    console.log(error)
  }
})

// Launch a web server to listen for GitHub webhooks
const port = process.env.PORT || 8080
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost'

const path = '/api/webhook'
const localWebhookUrl = `http://${host}:${port}${path}`

// See https://github.com/octokit/webhooks.js/#createnodemiddleware for all options
const middleware = createNodeMiddleware(app.webhooks, { path })

http
  .createServer((req, res) => {
    if (req.url === '/' && req.method === 'GET') {
      // Handle the root path ("/") requests
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Server is running.')
    } else {
      // Use middleware for other paths
      middleware(req, res)
    }
  })
  .listen(port, host, () => {
    console.log(`Server is listening for events at: ${localWebhookUrl}`)
    console.log('Press Ctrl + C to quit.')
  })
