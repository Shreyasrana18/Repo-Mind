const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const axios = require('axios')
const fs = require('fs').promises
const path = require('path')

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

async function runFunctionExtraction(code, fileName, filePath) {
    try {
        let ast
        if (typeof code === 'string' && code.trim().startsWith('{')) {
            ast = JSON.parse(code)
        } else {
            ast = parser.parse(code, {
                sourceType: 'module',
                locations: true
            })
        }
        const functions = []
        traverse(ast, {
            FunctionDeclaration(path) {
                const { start, end } = path.node
                const funcCode = code.slice(start, end)
                functions.push({
                    name: path.node.id.name,
                    type: 'FunctionDeclaration',
                    location: {
                        start: path.node.loc.start,
                        end: path.node.loc.end
                    },
                    code: funcCode,
                    file: fileName,
                    path: filePath
                })
            },
            ArrowFunctionExpression(path) {
                let name = 'anonymous'

                if (
                    path.parent.type === 'CallExpression' &&
                    path.parentPath.parent.type === 'VariableDeclarator' &&
                    path.parentPath.parent.id.type === 'Identifier'
                ) {
                    name = path.parentPath.parent.id.name
                } else if (
                    path.parent.type === 'VariableDeclarator' &&
                    path.parent.id.type === 'Identifier'
                ) {
                    name = path.parent.id.name
                } else if (
                    path.parent.type === 'ObjectProperty' &&
                    path.parent.key.type === 'Identifier'
                ) {
                    name = path.parent.key.name
                }

                const { start, end } = path.node
                const funcCode = code.slice(start, end)

                functions.push({
                    name,
                    type: 'ArrowFunction',
                    location: {
                        start: path.node.loc.start,
                        end: path.node.loc.end
                    },
                    code: funcCode,
                    file: fileName,
                    path: filePath
                })
            },
            AssignmentExpression(path) {
                if (
                    path.node.left.type === 'MemberExpression' &&
                    path.node.left.object.name === 'module' &&
                    path.node.left.property.name === 'exports'
                ) {
                    const { start, end } = path.node
                    const funcCode = code.slice(start, end)

                    functions.push({
                        name: path.node.left.property.name,
                        type: 'Exported Function',
                        location: {
                            start: path.node.loc.start,
                            end: path.node.loc.end
                        },
                        code: funcCode,
                        file: fileName,
                        path: filePath
                    })
                }
            }
        })
        return functions
    } catch (err) {
        console.error(`Error parsing code in ${fileName}:`, err.message)
        return []
    }
}

async function extractFunctionsFromTree(tree, owner, repo, results = [], currentPath = '') {
    for (const node of tree) {
        const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name

        if (node.type === 'folder' && node.children) {
            console.log(`Entering folder: ${nodePath}`)
            await extractFunctionsFromTree(node.children, owner, repo, results, nodePath)
        } else if (node.type === 'file' && node.name.endsWith('.js') && node.download_url) {
            try {
                console.log(`Fetching file: ${nodePath}`)
                const { data: code } = await axios.get(node.download_url)
                console.log(`Extracting functions from: ${nodePath}`)

                const extracted = await runFunctionExtraction(code, node.name, nodePath)

                if (extracted && extracted.length > 0) {
                    console.log(`Found ${extracted.length} functions in ${nodePath}`)
                    results.push(...extracted)
                } else {
                    console.log(`No functions found in ${nodePath}`)
                }
            } catch (err) {
                console.warn(`Error fetching or processing ${node.name}: ${err.message}`)
            }
        } else {
            console.log(`Skipping non-JS file or folder: ${node.name}`)
        }
    }
    return results
}

// Scrape repository structure and function data
async function scrapeDirectory(owner, repo) {
    const structureCache = path.join(__dirname, `${owner}-${repo}-structure.json`)
    let tree

    try {
        await fs.access(structureCache)
        tree = JSON.parse(await fs.readFile(structureCache, 'utf-8'))
    } catch {
        tree = await fetchTree(owner, repo)
        await fs.writeFile(structureCache, JSON.stringify(tree, null, 2), 'utf-8')
    }

    const functionMetadata = await extractFunctionsFromTree(tree, owner, repo)
    const functionCache = path.join(__dirname, `${owner}-${repo}-functions.json`)
    await fs.writeFile(functionCache, JSON.stringify(functionMetadata, null, 2), 'utf-8')

    return { tree, functionMetadata }
}

module.exports = { scrapeDirectory }