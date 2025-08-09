const axios = require('axios')
const fs = require('fs').promises
const path = require('path')
const { extractFunctionMetaData, extractRoutesMetaData, extractModelMetaData } = require('../utils/extraction-tools')
const { enrichAllMetadata } = require('../utils/summarize-tool')

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

async function extractFunctionsFromTree(tree, owner, repo, functionResults = [], routeResults = [], modelResults = [], currentPath = '') {
    for (const node of tree) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name

        if (node.type === 'folder' && node.children) {
            console.log(`Entering folder: ${nodePath}`)
            await extractFunctionsFromTree(node.children, owner, repo, functionResults, routeResults, modelResults, nodePath)
        } else if (node.type === 'file' && node.name.endsWith('.js') && node.download_url) {
            try {
                console.log(`Fetching file: ${nodePath}`)
                const { data: code } = await axios.get(node.download_url)
                console.log(`Extracting functions from: ${nodePath}`)

                const extractedFunctions = await extractFunctionMetaData(code, node.name, nodePath, node.download_url)

                if (extractedFunctions && extractedFunctions.length > 0) {
                    console.log(`Found ${extractedFunctions.length} functions in ${nodePath}`)
                    functionResults.push(...extractedFunctions)
                } else {
                    console.log(`No functions found in ${nodePath}`)
                }

                // Extract routes if it's a route file
                const extractedRoutes = extractRoutesMetaData(code, node.name, nodePath, node.download_url)
                if (extractedRoutes?.length) {
                    console.log(`Found ${extractedRoutes.length} routes in ${nodePath}`)
                    routeResults.push(...extractedRoutes)
                }

                // Extract models
                const extractedModels = extractModelMetaData(code, node.name, nodePath, node.download_url)
                if (extractedModels?.length) {
                    console.log(`Found ${extractedModels.length} models in ${nodePath}`)
                    modelResults.push(...extractedModels)
                }
            } catch (err) {
                console.warn(`Error fetching or processing ${node.name}: ${err.message}`)
            }
        } else {
            console.log(`Skipping non-JS file or folder: ${node.name}`)
        }
    }
    return { functionResults, routeResults, modelResults }
}

const loadCache = async (cachePath, skipCache, fetchFunction) => {
    if (skipCache) {
        console.log(`Skipping cache for ${path.basename(cachePath)}. Fetching fresh data...`)
        try {
            const data = await fetchFunction()
            if (data && Object.keys(data).length > 0) {
                await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
            } else {
                console.error(`Fetched data is empty. Skipping cache write for ${path.basename(cachePath)}.`)
            }
            return data
        } catch (err) {
            console.error(`Error fetching data: ${err.message}`)
            return null
        }
    }
    try {
        await fs.access(cachePath)
        console.log(`${path.basename(cachePath)} loaded from cache.`)
        return JSON.parse(await fs.readFile(cachePath, 'utf-8'))
    } catch {
        console.log(`${path.basename(cachePath)} not found in cache. Fetching...`)
        try {
            const data = await fetchFunction()
            if (data && Object.keys(data).length > 0) {
                await fs.writeFile(cachePath, JSON.stringify(data, null, 2), 'utf-8')
            } else {
                console.error(`Fetched data is empty. Skipping cache write for ${path.basename(cachePath)}.`)
            }
            return data
        } catch (err) {
            console.error(`Error fetching data: ${err.message}`)
            return null
        }
    }
}
// Scrape repository structure and function data
async function scrapeDirectory(owner, repo, skipCache = false) {
    const structureCachePath = path.join(__dirname, `${owner}-${repo}-structure.json`)
    const functionCachePath = path.join(__dirname, `${owner}-${repo}-functions.json`)

    const tree = await loadCache(structureCachePath, skipCache, () => fetchTree(owner, repo))
    const { functionResults, routeResults, modelResults } = await loadCache(functionCachePath, skipCache, () => extractFunctionsFromTree(tree, owner, repo))
    
    // enrich data with summaries
    await enrichAllMetadata(functionCachePath)
    return { tree, functionResults, routeResults, modelResults }
}

module.exports = { scrapeDirectory }