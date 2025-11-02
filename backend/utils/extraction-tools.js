const parser = require('@babel/parser')
const path = require('path')
const traverse = require('@babel/traverse').default
const { sendToKafka } = require('../kafka/producer')

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
function extractRoutesMetaData(code, fileName, filePath, downloadUrl, dbId) {
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

            const processRoute = async (routePathNode, methodNode, argList) => {
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
                const routesData = {
                    kind: 'route',
                    path: routePath,
                    method,
                    middlewares: allHandlers.slice(0, -1),
                    handler: allHandlers.at(-1),
                    file: fileName,
                    filePath: `${filePath}`,
                    downloadUrl
                }
                await sendToKafka('summary-topic', { db: dbId, type: "route", data: routesData })
                routes.push(routesData)
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
async function extractFunctionMetaData(code, fileName, filePath, downloadUrl, dbId) {
    try {
        if (typeof code !== 'string') {
            throw new Error('Invalid code input: Expected a string')
        }

        let ast
        try {
            if (code.trim().startsWith('{')) {
                ast = JSON.parse(code)
            } else {
                ast = parser.parse(code, {
                    sourceType: 'module',
                    locations: true,
                })
            }
        } catch (parseErr) {
            throw new Error(`Code parsing failed: ${parseErr.message}`)
        }

        const importMap = {}
        const functions = []

        // Capture import and require statements to help resolve where functions come from
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

        function extractUsedFunctions(funcPath, importMap) {
            const used = []

            // Collect all variables declared or passed into this function
            const declaredVariables = new Set()

            // Add function parameters (req, res, next)
            funcPath.node.params?.forEach(param => {
                if (param.type === 'Identifier') declaredVariables.add(param.name)
            })

            // Traverse inside the function to collect used functions
            funcPath.traverse({
                VariableDeclarator(innerPath) {
                    if (innerPath.node.id.type === 'Identifier') {
                        declaredVariables.add(innerPath.node.id.name)
                    }
                },
                FunctionDeclaration(innerPath) {
                    if (innerPath.node.id?.name) {
                        declaredVariables.add(innerPath.node.id.name)
                    }
                },
                CallExpression(innerPath) {
                    const callee = innerPath.node.callee

                    if (callee.type === 'Identifier') {
                        if (!declaredVariables.has(callee.name)) {
                            const importedFrom = importMap[callee.name]
                            if (importedFrom) {
                                if (importedFrom.startsWith('.') || importedFrom.startsWith('/')) {
                                    const normalizedPath = `./${importedFrom.replace(/^\.\//, '')}`
                                    const resolvedPath = resolveImportedPath(normalizedPath, downloadUrl)
                                    used.push({
                                        name: callee.name,
                                        importedFrom: resolvedPath,
                                        type: 'module'
                                    })
                                } else {
                                    used.push({
                                        name: callee.name,
                                        importedFrom: importedFrom,
                                        type: 'library'
                                    })
                                }
                            }
                        }
                    }

                    if (callee.type === 'MemberExpression') {
                        const object = callee.object
                        const property = callee.property

                        if (
                            object.type === 'Identifier' &&
                            property.type === 'Identifier' &&
                            !declaredVariables.has(object.name)
                        ) {
                            const importedFrom = importMap[object.name]
                            if (importedFrom) {
                                if (importedFrom.startsWith('.') || importedFrom.startsWith('/')) {
                                    // Local file/module
                                    const normalizedPath = `./${importedFrom.replace(/^\.\//, '')}`
                                    const resolvedPath = resolveImportedPath(normalizedPath, downloadUrl)

                                    used.push({
                                        name: `${object.name}.${property.name}`,
                                        importedFrom: resolvedPath,
                                        type: 'module'
                                    })
                                } else {
                                    // Library
                                    used.push({
                                        name: `${object.name}.${property.name}`,
                                        importedFrom: importedFrom,
                                        type: 'library'
                                    })
                                }
                            }
                        }
                    }
                }
            })

            return used
        }

        function detectFunctionType(paramsLength, baseType) {
            if (paramsLength === 2) return "RouteHandler"
            if (paramsLength > 2) return "Middleware"
            return baseType
        }

        const collectFunction = async (name, baseType, path) => {
            const { start, end } = path.node
            const funcCode = code.slice(start, end)
            const usedFns = extractUsedFunctions(path, importMap)
            const paramsLength = path.node.params?.length || 0
            const actualType = detectFunctionType(paramsLength, baseType)

            const functionData = {
                name,
                type: actualType,
                location: {
                    start: path.node.loc.start,
                    end: path.node.loc.end
                },
                code: funcCode,
                downloadUrl,
                functionsUsed: usedFns,
                file: fileName,
                path: filePath
            }
            await sendToKafka('summary-topic', { db: dbId, type: "function", data: functionData })
            functions.push(functionData)
        }

        traverse(ast, {
            FunctionDeclaration(path) {
                collectFunction(path.node.id.name, 'FunctionDeclaration', path)
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

                collectFunction(name, 'ArrowFunction', path)
            },
            async AssignmentExpression(path) {
                if (
                    path.node.left.type === 'MemberExpression' &&
                    path.node.left.object.name === 'module' &&
                    path.node.left.property.name === 'exports'
                ) {
                    const { start, end } = path.node
                    const funcCode = code.slice(start, end)

                    const functionData = {
                        name: path.node.left.property.name,
                        type: 'Exported Function',
                        location: {
                            start: path.node.loc.start,
                            end: path.node.loc.end
                        },
                        code: funcCode,
                        functionsUsed: [],
                        file: fileName,
                        path: filePath
                    }
                    await sendToKafka('summary-topic', { db: dbId, type: "function", data: functionData })
                    functions.push(functionData)
                }
            }
        })

        return functions
    } catch (err) {
        console.error(`Error parsing code in ${fileName}:`, err.message)
        return []
    }
}

// This function extracts Mongoose model metadata from a given code string.
function extractModelMetaData(code, fileName, filePath, downloadUrl, dbId) {
    try {
        if (typeof code !== 'string') {
            throw new Error('Invalid code input: Expected a string')
        }

        const ast = parser.parse(code, {
            sourceType: 'module',
            locations: true,
        })

        const models = []
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

        // Second pass: extract model definitions
        traverse(ast, {
            CallExpression(path) {
                // Look for mongoose.model() calls
                if (
                    path.node.callee.type === 'MemberExpression' &&
                    path.node.callee.object.name === 'mongoose' &&
                    path.node.callee.property.name === 'model' &&
                    path.node.arguments.length >= 2
                ) {
                    const modelName = path.node.arguments[0].value

                    // Find the schema definition
                    let schemaDefinition = null
                    let schemaNode = null

                    // Look for schema definition in the AST
                    traverse(ast, {
                        VariableDeclaration(schemaPath) {
                            schemaPath.node.declarations.forEach(decl => {
                                if (
                                    decl.id.name === 'noteSchema' ||
                                    decl.id.name === 'userSchema' ||
                                    decl.id.name.toLowerCase().includes('schema')
                                ) {
                                    if (decl.init && decl.init.type === 'CallExpression' &&
                                        decl.init.callee.type === 'MemberExpression' &&
                                        decl.init.callee.object.name === 'mongoose' &&
                                        decl.init.callee.property.name === 'Schema') {
                                        schemaDefinition = decl.init
                                        schemaNode = decl.init.arguments[0]
                                    }
                                }
                            })
                        }
                    })

                    // Extract schema definition
                    const schema = {}
                    if (schemaNode && schemaNode.type === 'ObjectExpression') {
                        schemaNode.properties.forEach(prop => {
                            if (prop.key.type === 'Identifier') {
                                const fieldName = prop.key.name
                                const fieldDefinition = extractFieldDefinition(prop.value)
                                schema[fieldName] = fieldDefinition
                            }
                        })
                    }

                    // Get the full model code
                    const modelCode = code.slice(path.node.start, path.node.end)
                    const schemaCode = schemaDefinition ? code.slice(schemaDefinition.start, schemaDefinition.end) : ''

                    const modelData = {
                        name: modelName,
                        schema,
                        location: {
                            start: path.node.loc.start,
                            end: path.node.loc.end
                        },
                        code: modelCode,
                        schemaCode: schemaCode,
                        file: fileName,
                        path: filePath,
                        downloadUrl
                    }
                    sendToKafka('summary-topic', { db: dbId, type: "model", data: modelData })
                    models.push(modelData)
                }
            }
        })

        return models
    } catch (err) {
        console.error(`Error parsing model in ${fileName}:`, err.message)
        return []
    }
}

// Helper function to extract field definition information
function extractFieldDefinition(node) {
    const fieldDef = {
        type: 'Mixed',
        required: false,
        default: undefined,
        unique: false,
        index: false,
        validate: undefined,
        enum: undefined,
        min: undefined,
        max: undefined,
        minlength: undefined,
        maxlength: undefined,
        match: undefined,
        ref: undefined,
        sparse: false,
        trim: false,
        uppercase: false,
        lowercase: false
    }

    if (node.type === 'ObjectExpression') {
        node.properties.forEach(prop => {
            const propName = prop.key.name
            const propValue = prop.value

            switch (propName) {
                case 'type':
                    if (propValue.type === 'MemberExpression') {
                        fieldDef.type = propValue.property.name
                    } else if (propValue.type === 'StringLiteral') {
                        fieldDef.type = propValue.value
                    } else if (propValue.type === 'ArrayExpression') {
                        fieldDef.type = 'Array'
                        fieldDef.items = propValue.elements.map(elem => {
                            if (elem.type === 'MemberExpression') {
                                return elem.property.name
                            }
                            return elem.value
                        })
                    }
                    break
                case 'required':
                    fieldDef.required = propValue.value
                    break
                case 'default':
                    if (propValue.type === 'CallExpression' &&
                        propValue.callee.name === 'Date' &&
                        propValue.callee.property?.name === 'now') {
                        fieldDef.default = 'Date.now'
                    } else {
                        fieldDef.default = propValue.value
                    }
                    break
                case 'unique':
                    fieldDef.unique = propValue.value
                    break
                case 'index':
                    fieldDef.index = propValue.value
                    break
                case 'validate':
                    if (propValue.type === 'ObjectExpression') {
                        fieldDef.validate = {
                            validator: propValue.properties.find(p => p.key.name === 'validator')?.value.value,
                            message: propValue.properties.find(p => p.key.name === 'message')?.value.value
                        }
                    }
                    break
                case 'enum':
                    if (propValue.type === 'ArrayExpression') {
                        fieldDef.enum = propValue.elements.map(elem => elem.value)
                    }
                    break
                case 'min':
                    fieldDef.min = propValue.value
                    break
                case 'max':
                    fieldDef.max = propValue.value
                    break
                case 'minlength':
                    fieldDef.minlength = propValue.value
                    break
                case 'maxlength':
                    fieldDef.maxlength = propValue.value
                    break
                case 'match':
                    fieldDef.match = propValue.value
                    break
                case 'ref':
                    fieldDef.ref = propValue.value
                    break
                case 'sparse':
                    fieldDef.sparse = propValue.value
                    break
                case 'trim':
                    fieldDef.trim = propValue.value
                    break
                case 'uppercase':
                    fieldDef.uppercase = propValue.value
                    break
                case 'lowercase':
                    fieldDef.lowercase = propValue.value
                    break
            }
        })
    } else if (node.type === 'MemberExpression') {
        fieldDef.type = node.property.name
    } else if (node.type === 'StringLiteral') {
        fieldDef.type = node.value
    }

    // Remove undefined properties
    Object.keys(fieldDef).forEach(key => {
        if (fieldDef[key] === undefined) {
            delete fieldDef[key]
        }
    })

    return fieldDef
}


module.exports = {
    extractRoutesMetaData,
    extractFunctionMetaData,
    extractModelMetaData
}
