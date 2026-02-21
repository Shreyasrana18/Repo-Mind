const axios = require('axios')
const { extractFunctionMetaData, extractRoutesMetaData, extractModelMetaData } = require('../utils/extraction-tools')
const db = require('../db/knex')

// Fetch repository file tree recursively
async function fetchTree(owner, repo, currentPath = '') {
    const tree = []
    try {
        const { data } = await axios.get(`https://api.github.com/repos/${owner}/${repo}/contents/${currentPath}`, {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` },

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

async function extractFunctionsFromTree(tree, owner, repo, dbId, currentPath = '') {
    for (const node of tree) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name
        if (node.type === 'folder' && node.children) {
            console.log(`Entering folder: ${nodePath}`)
            await extractFunctionsFromTree(node.children, owner, repo, dbId, nodePath)
        } else if (node.type === 'file' && node.name.endsWith('.js') && node.download_url) {
            try {
                console.log(`Fetching file: ${nodePath}`)
                const { data: code } = await axios.get(node.download_url)
                console.log(`Extracting functions from: ${nodePath}`)

                await extractFunctionMetaData(code, node.name, nodePath, node.download_url, dbId)
                await extractRoutesMetaData(code, node.name, nodePath, node.download_url, dbId)
                await extractModelMetaData(code, node.name, nodePath, node.download_url, dbId)
            } catch (err) {
                console.warn(`Error fetching or processing ${node.name}: ${err.message}`)
            }
        } else {
            console.log(`Skipping non-JS file or folder: ${node.name}`)
        }
    }
}

// Scrape repository structure and function data
async function scrapeDirectory(owner, repo) {
    const tree = await fetchTree(owner, repo)
    let dbId = null
    if (tree && tree.length > 0) {
        const repoId = `${owner}/${repo}`
        try {
            const existing = await db('meta_owner')
                .where({ repo_id: repoId })
                .first()

            if (existing) {
                dbId = existing.id
            } else {
                const [inserted] = await db('meta_owner')
                    .insert({ repo_id: repoId })
                    .returning('id')

                dbId = inserted.id
                console.log(`Inserted repo ${repoId} into meta_owner`)
            }
        } catch (err) {
            console.error(`DB error inserting repo ${repoId}: ${err.message}`)
        }
    }
    await extractFunctionsFromTree(tree, owner, repo, dbId)
    return { tree }
}

module.exports = { scrapeDirectory }