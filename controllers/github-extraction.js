const { scrapeDirectory } = require('./extract-function')

async function scrape(req, res) {
  const repo = req.query.repo
  const skipCache = req.query.skipCache === 'true'
  if (!repo || !repo.startsWith('https://github.com/')) {
    return res.status(400).json({ error: 'Invalid or missing repo URL' })
  }

  try {
    const [_, user, project] = new URL(repo).pathname.split('/')
    const { tree: tree, functionResults: functionMetaData, routeResults: routesMetadata } = await scrapeDirectory(user, project, skipCache)

    if (!Array.isArray(tree)) {
      return res.status(500).json({ error: 'Repository structure is not an array' })
    }
    res.status(200).json({ structure: tree, functions: functionMetaData, routes: routesMetadata })
  } catch (err) {
    console.error(`Error: ${err.message}`)
    res.status(500).json({ error: `Error fetching repository structure: ${err.message}` })
  }
}

async function test(req, res) {
  res.status(200).json({ message: 'Hello from the test route' })
}

module.exports = { scrape, test }
