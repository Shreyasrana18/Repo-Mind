const parser = require('@babel/parser')
const path = require('path')
const traverse = require('@babel/traverse').default

function resolveImportedPath(importedFrom, downloadUrl) {
    const repoPath = downloadUrl
        .replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '')
        .split('/')
        .slice(0, -1)
        .join('/')

    const resolvedPath = path.normalize(path.join(repoPath, importedFrom))
    return resolvedPath
}

// This function extracts Express routes from a given code string.
function extractRoutesMetaData(code, fileName, filePath, downloadUrl) {
    const ast = parser.parse(code, {
        sourceType: 'module'
    })

    const routes = []
    const seen = new Set()
    const importMap = {}

    // First pass: capture imports and require statements
    traverse(ast, {
        ImportDeclaration(path) {
            const source = path.node.source.value
            path.node.specifiers.forEach(spec => {
                if (spec.type === 'ImportSpecifier' || spec.type === 'ImportDefaultSpecifier') {
                    importMap[spec.local.name] = source
                }
            })
        },
        VariableDeclaration(path) {
            path.node.declarations.forEach(decl => {
                if (
                    decl.init &&
                    decl.init.type === 'CallExpression' &&
                    decl.init.callee.name === 'require' &&
                    decl.init.arguments.length === 1 &&
                    decl.init.arguments[0].type === 'StringLiteral'
                ) {
                    const source = decl.init.arguments[0].value
                    if (decl.id.type === 'ObjectPattern') {
                        decl.id.properties.forEach(prop => {
                            importMap[prop.value.name] = source
                        })
                    } else if (decl.id.type === 'Identifier') {
                        importMap[decl.id.name] = source
                    }
                }
            })
        }
    })

    // Second pass: extract route declarations
    traverse(ast, {
        CallExpression(path) {
            const { callee, arguments: args } = path.node

            const processRoute = (routePathNode, methodNode, argList) => {
                if (!routePathNode || routePathNode.type !== 'StringLiteral') return

                const method = methodNode.name?.toUpperCase()
                if (!method || method === 'ROUTE') return

                const routePath = routePathNode.value
                const routeKey = `${method}:${routePath}`
                if (seen.has(routeKey)) return
                seen.add(routeKey)

                const allHandlers = argList.map(arg => {
                    const name = arg.name || 'anonymous'
                    const importPath = importMap[name] || null
                    if (!importPath) {
                        return { name, importedFrom: null }
                    }
                    const normalizedPath = importPath.startsWith('.')
                        ? `./${importPath.replace(/^\.\//, '')}`
                        : importPath

                    const resolvedPath = resolveImportedPath(normalizedPath, downloadUrl)

                    return {
                        name,
                        importedFrom: resolvedPath
                    }
                })

                routes.push({
                    kind: 'route',
                    path: routePath,
                    method,
                    middlewares: allHandlers.slice(0, -1),
                    handler: allHandlers.at(-1),
                    file: fileName,
                    filePath: `${filePath}`,
                    downloadUrl
                })
            }

            // router.route('/path').get(...)
            if (
                callee.type === 'MemberExpression' &&
                callee.object.type === 'CallExpression' &&
                callee.object.callee.type === 'MemberExpression' &&
                callee.object.callee.property.name === 'route'
            ) {
                const routePathNode = callee.object.arguments[0]
                processRoute(routePathNode, callee.property, args)
            }

            // router.get('/path', ...)
            if (
                callee.type === 'MemberExpression' &&
                callee.object.name === 'router' &&
                args.length > 0 &&
                args[0].type === 'StringLiteral'
            ) {
                const routePathNode = args[0]
                processRoute(routePathNode, callee.property, args.slice(1))
            }
        }
    })

    return routes
}

// This function metadata extracts functions from a given code string.
async function extractFunctionMetaData(code, fileName, filePath) {
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

module.exports = {
    extractRoutesMetaData,
    extractFunctionMetaData
}
