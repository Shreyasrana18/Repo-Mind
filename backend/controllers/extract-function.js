const axios = require('axios')
const fs = require('fs').promises
const path = require('path')
const { extractFunctionMetaData, extractRoutesMetaData, extractModelMetaData } = require('../utils/extraction-tools')
const { enrichAllMetadata } = require('../utils/summarize-tool')
const { client } = require('../db/pg')

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

async function extractFunctionsFromTree(tree, owner, repo, dbId, functionResults = [], routeResults = [], modelResults = [], currentPath = '') {
    for (const node of tree) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name

        if (node.type === 'folder' && node.children) {
            console.log(`Entering folder: ${nodePath}`)
            await extractFunctionsFromTree(node.children, owner, repo, dbId, functionResults, routeResults, modelResults, nodePath)
        } else if (node.type === 'file' && node.name.endsWith('.js') && node.download_url) {
            try {
                console.log(`Fetching file: ${nodePath}`)
                const { data: code } = await axios.get(node.download_url)
                console.log(`Extracting functions from: ${nodePath}`)

                const extractedFunctions = await extractFunctionMetaData(code, node.name, nodePath, node.download_url, dbId)

                if (extractedFunctions && extractedFunctions.length > 0) {
                    console.log(`Found ${extractedFunctions.length} functions in ${nodePath}`)
                    functionResults.push(...extractedFunctions)
                } else {
                    console.log(`No functions found in ${nodePath}`)
                }

                // Extract routes if it's a route file
                const extractedRoutes = extractRoutesMetaData(code, node.name, nodePath, node.download_url, dbId)
                if (extractedRoutes?.length) {
                    console.log(`Found ${extractedRoutes.length} routes in ${nodePath}`)
                    routeResults.push(...extractedRoutes)
                }

                // Extract models
                const extractedModels = extractModelMetaData(code, node.name, nodePath, node.download_url, dbId)
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

// Scrape repository structure and function data
async function scrapeDirectory(owner, repo) {
    const tree = await fetchTree(owner, repo)
    let dbId = null
    if (tree && tree.length > 0) {
        const repoId = `${owner}/${repo}`
        try {
            const res = await client.query('SELECT id FROM meta_owner WHERE repo_id = $1', [repoId])
            dbId = res.rows.length > 0 ? res.rows[0].id : null
            if (res.rowCount === 0) {
                const data = await client.query('INSERT INTO meta_owner (repo_id) VALUES ($1)', [repoId])
                dbId = data.rows[0].id
                console.log(`Inserted repo ${repoId} into meta_owner`)
            }
        } catch (err) {
            console.error(`DB error inserting repo ${repoId}: ${err.message}`)
        }
    }
    const { functionResults, routeResults, modelResults } = await extractFunctionsFromTree(tree, owner, repo, dbId)
    return { tree, functionResults, routeResults, modelResults }
}

module.exports = { scrapeDirectory }