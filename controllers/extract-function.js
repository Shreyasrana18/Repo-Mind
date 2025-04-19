const axios = require('axios')
const fs = require('fs').promises
const path = require('path')
const { runFunctionExtraction, extractExpressRoutes } = require('../utils/extraction-tools')

// Fetch repository file tree recursively
async function fetchTree(owner, repo, currentPath = '') {
    const tree = []
    try {
        const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${currentPath}`, {
            headers: { 'Accept': 'application/vnd.github.v3+json' }
        })

        for (const item of data) {
            if (item.type === 'dir') {
                const children = await fetchTree(owner, repo, item.path)
                tree.push({
                    name: item.name,
                    type: 'folder',
                    children
                })
            } else if (item.type === 'file') {
                tree.push({
                    name: item.name,
                    type: 'file',
                    path: item.path,
                    download_url: item.download_url
                })
            }
        }
    } catch (err) {
        console.error(`Error fetching ${currentPath}: ${err.message}`)
        tree.push({
            name: `Error: ${err.message}`,
            type: 'error'
        })
    }
    return tree
}

async function extractFunctionsFromTree(tree, owner, repo, functionResults = [], routeResults = [], currentPath = '') {
    for (const node of tree) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name

        if (node.type === 'folder' && node.children) {
            console.log(`Entering folder: ${nodePath}`)
            await extractFunctionsFromTree(node.children, owner, repo, functionResults, routeResults, nodePath)
        } else if (node.type === 'file' && node.name.endsWith('.js') && node.download_url) {
            try {
                console.log(`Fetching file: ${nodePath}`)
                const { data: code } = await axios.get(node.download_url)
                console.log(`Extracting functions from: ${nodePath}`)

                const extractedFunctions = await runFunctionExtraction(code, node.name, nodePath)

                if (extractedFunctions && extractedFunctions.length > 0) {
                    console.log(`Found ${extractedFunctions.length} functions in ${nodePath}`)
                    functionResults.push(...extractedFunctions)
                } else {
                    console.log(`No functions found in ${nodePath}`)
                }

                // Extract routes if it's a route file
                const extractedRoutes = extractExpressRoutes(code, node.name, nodePath)
                if (extractedRoutes?.length) {
                    console.log(`Found ${extractedRoutes.length} routes in ${nodePath}`)
                    routeResults.push(...extractedRoutes)
                }
            } catch (err) {
                console.warn(`Error fetching or processing ${node.name}: ${err.message}`)
            }
        } else {
            console.log(`Skipping non-JS file or folder: ${node.name}`)
        }
    }
    return { functionResults, routeResults }
}

const loadCache = async (cachePath, skipCache, fetchFunction) => {
    if (skipCache) {
        console.log(`Skipping cache for ${path.basename(cachePath)}. Fetching fresh data...`)
        const data = await fetchFunction()
        await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
        return data
    }
    try {
        await fs.access(cachePath)
        console.log(`${path.basename(cachePath)} loaded from cache.`)
        return JSON.parse(await fs.readFile(cachePath, 'utf-8'))
    } catch {
        console.log(`${path.basename(cachePath)} not found in cache. Fetching...`)
        const data = await fetchFunction()
        await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
        return data
    }
}
// Scrape repository structure and function data
async function scrapeDirectory(owner, repo, skipCache = false) {
    const structureCachePath = path.join(__dirname, `${owner}-${repo}-structure.json`)
    const functionCachePath = path.join(__dirname, `${owner}-${repo}-functions.json`)

    const tree = await loadCache(structureCachePath, skipCache, () => fetchTree(owner, repo))
    const { functionResults, routeResults } = await loadCache(functionCachePath, skipCache, () => extractFunctionsFromTree(tree, owner, repo))

    return { tree, functionResults, routeResults }
}

module.exports = { scrapeDirectory }