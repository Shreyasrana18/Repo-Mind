const parser = require('@babel/parser')
const path = require('path')
const traverse = require('@babel/traverse').default
const { sendToKafka } = require('../kafka/producer')


const PARSER_OPTS = {
    sourceType: 'module',
    locations: true,
    plugins: ['typescript', 'jsx', 'classProperties', 'decorators-legacy']
}


const HTTP_METHODS = new Set([
    'get', 'post', 'put', 'patch', 'delete', 'all', 'use', 'head', 'options'
])


const TEST_FILE_RE = /\.(test|spec)\.[jt]sx?$|__tests__[/\\]|[/\\]test[/\\]/


const SKIP_CALLBACKS = new Set([
    'listen', 'then', 'catch', 'finally', 'on', 'once',
    'setTimeout', 'setInterval', 'forEach', 'map', 'filter',
    'reduce', 'find', 'some', 'every', 'connect', 'send',
    'describe', 'it', 'test', 'before', 'after',
    'beforeEach', 'afterEach', 'beforeAll', 'afterAll',
    'request', 'end', 'nextTick', 'setImmediate'
])




// ─── Shared Utilities ────────────────────────────────────────


function safeParse(code) {
    return parser.parse(code, PARSER_OPTS)
}


function isTestFile(filePath) {
    return TEST_FILE_RE.test(filePath)
}


function resolveImportedPath(importedFrom, downloadUrl) {
    if (!importedFrom.startsWith('.') && !importedFrom.startsWith('/')) {
        return importedFrom
    }
    const repoPath = downloadUrl
        .replace(/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+\//, '')
        .split('/')
        .slice(0, -1)
        .join('/')
    const normalized = `./${importedFrom.replace(/^\.\//, '')}`
    return path.normalize(path.join(repoPath, normalized))
}


function buildImportMap(ast) {
    const map = {}
    traverse(ast, {
        ImportDeclaration({ node }) {
            const src = node.source.value
            node.specifiers.forEach(s => {
                if (s.local?.name) map[s.local.name] = src
            })
        },
        VariableDeclarator({ node }) {
            if (node.init?.type !== 'CallExpression') return
            if (node.init.callee?.name !== 'require') return
            const arg = node.init.arguments?.[0]
            if (arg?.type !== 'StringLiteral') return
            if (node.id.type === 'Identifier') {
                map[node.id.name] = arg.value
            } else if (node.id.type === 'ObjectPattern') {
                node.id.properties.forEach(p => {
                    const name = p.value?.name || p.key?.name
                    if (name) map[name] = arg.value
                })
            }
        }
    })
    return map
}


function resolveHandler(name, importMap, downloadUrl) {
    const src = importMap[name]
    if (!src) return { name, importedFrom: null }
    return { name, importedFrom: resolveImportedPath(src, downloadUrl) }
}




// ─── Route Extraction ────────────────────────────────────────


async function extractRoutesMetaData(code, fileName, filePath, downloadUrl, dbId) {
    if (isTestFile(filePath)) return


    let ast
    try { ast = safeParse(code) } catch { return }


    const importMap = buildImportMap(ast)
    const seen = new Set()
    const routerVars = findRouterVars(ast)
    const results = []


    traverse(ast, {
        CallExpression(nodePath) {
            const { callee, arguments: args } = nodePath.node
            if (callee.type !== 'MemberExpression') return


            let method, routePath, handlerArgs


            // router.route('/path').get(handler)
            if (
                callee.object?.type === 'CallExpression' &&
                callee.object.callee?.property?.name === 'route'
            ) {
                routePath = callee.object.arguments[0]?.value
                method = callee.property?.name?.toLowerCase()
                handlerArgs = args
            }
            // router.get('/path', handler) | app.post('/path', handler)
            else if (
                routerVars.has(callee.object?.name) &&
                args[0]?.type === 'StringLiteral'
            ) {
                method = callee.property?.name?.toLowerCase()
                routePath = args[0].value
                handlerArgs = args.slice(1)
            }


            if (!method || !HTTP_METHODS.has(method) || typeof routePath !== 'string') return


            const key = `${method}:${routePath}`
            if (seen.has(key)) return
            seen.add(key)


            const handlers = handlerArgs
                .map(a => a.name || a.callee?.name)
                .filter(Boolean)
                .map(name => resolveHandler(name, importMap, downloadUrl))


            results.push({
                kind: 'route',
                path: routePath,
                method: method.toUpperCase(),
                middlewares: handlers.slice(0, -1),
                handler: handlers.at(-1) || null,
                file: fileName,
                filePath,
                downloadUrl
            })
        }
    })


    for (const data of results) {
        await sendToKafka('summary-topic', { db: dbId, type: 'route', data })
    }
}


function findRouterVars(ast) {
    const vars = new Set(['router', 'app'])
    traverse(ast, {
        VariableDeclarator({ node }) {
            if (!node.id?.name || !node.init) return
            const init = node.init
            if (init.type === 'CallExpression') {
                // express.Router()
                if (init.callee?.property?.name === 'Router') vars.add(node.id.name)
                // express()
                if (init.callee?.name === 'express') vars.add(node.id.name)
            }
        }
    })
    return vars
}




// ─── Function Extraction ─────────────────────────────────────


async function extractFunctionMetaData(code, fileName, filePath, downloadUrl, dbId) {
    if (isTestFile(filePath)) return

    let ast
    try { ast = safeParse(code) } catch { return }


    const importMap = buildImportMap(ast)
    const collected = new Set()
    const results = []


    function getFuncName(nodePath) {
        const parent = nodePath.parent
        if (parent.type === 'VariableDeclarator') return parent.id?.name
        // const x = asyncHandler((req, res) => {})
        if (
            parent.type === 'CallExpression' &&
            nodePath.parentPath?.parent?.type === 'VariableDeclarator'
        ) {
            return nodePath.parentPath.parent.id?.name
        }
        // exports.login = () => {} or module.exports.login = () => {}
        if (parent.type === 'AssignmentExpression' && parent.left?.type === 'MemberExpression') {
            const prop = parent.left.property?.name
            if (prop && prop !== 'exports') return prop
        }
        if (parent.type === 'ObjectProperty') return parent.key?.name
        return null
    }


    function isCallbackArg(nodePath) {
        if (nodePath.parent.type !== 'CallExpression') return false
        const callee = nodePath.parent.callee
        const name = callee?.name || callee?.property?.name
        return Boolean(name && SKIP_CALLBACKS.has(name))
    }


    function isTrivial(node, funcCode) {
        if (funcCode.length < 30) return true
        if (!node.body || node.body.type !== 'BlockStatement') return false
        const stmts = node.body.body.filter(s => s.type !== 'EmptyStatement')
        if (stmts.length === 0) return true
        if (
            stmts.length === 1 &&
            stmts[0].type === 'ExpressionStatement' &&
            stmts[0].expression?.callee?.object?.name === 'console'
        ) return true
        return false
    }


    function classifyType(paramsLen, base) {
        if (paramsLen === 2) return 'RouteHandler'
        if (paramsLen >= 3) return 'Middleware'
        return base
    }


    function extractDeps(funcPath) {
        const deps = []
        const locals = new Set()
        funcPath.node.params?.forEach(p => {
            if (p.type === 'Identifier') locals.add(p.name)
        })


        funcPath.traverse({
            VariableDeclarator(p) { if (p.node.id?.name) locals.add(p.node.id.name) },
            FunctionDeclaration(p) { if (p.node.id?.name) locals.add(p.node.id.name) },
            CallExpression(p) {
                const callee = p.node.callee
                let name, lookup


                if (callee.type === 'Identifier') {
                    name = callee.name
                    lookup = callee.name
                } else if (
                    callee.type === 'MemberExpression' &&
                    callee.object?.type === 'Identifier'
                ) {
                    name = `${callee.object.name}.${callee.property?.name}`
                    lookup = callee.object.name
                } else return


                if (locals.has(lookup)) return
                const src = importMap[lookup]
                if (!src) return


                const isLocal = src.startsWith('.') || src.startsWith('/')
                deps.push({
                    name,
                    importedFrom: isLocal ? resolveImportedPath(src, downloadUrl) : src,
                    type: isLocal ? 'module' : 'library'
                })
            }
        })


        const seen = new Set()
        return deps.filter(d => {
            if (seen.has(d.name)) return false
            seen.add(d.name)
            return true
        })
    }


    function emit(name, baseType, funcPath) {
        if (!name || name === 'anonymous' || collected.has(name)) return
        const node = funcPath.node
        const funcCode = code.slice(node.start, node.end)
        if (isTrivial(node, funcCode)) return


        collected.add(name)
        results.push({
            name,
            type: classifyType(node.params?.length || 0, baseType),
            location: { start: node.loc.start, end: node.loc.end },
            code: funcCode,
            downloadUrl,
            functionsUsed: extractDeps(funcPath),
            file: fileName,
            filePath
        })
    }


    traverse(ast, {
        FunctionDeclaration(p) {
            if (p.node.id?.name) emit(p.node.id.name, 'FunctionDeclaration', p)
        },
        FunctionExpression(p) {
            if (isCallbackArg(p)) return
            const name = getFuncName(p) || p.node.id?.name
            if (name) emit(name, 'FunctionExpression', p)
        },
        ArrowFunctionExpression(p) {
            if (isCallbackArg(p)) return
            const name = getFuncName(p)
            if (name) emit(name, 'ArrowFunction', p)
        }
    })


    for (const data of results) {
        await sendToKafka('summary-topic', { db: dbId, type: 'function', data })
    }
}




// ─── Model Extraction ────────────────────────────────────────


async function extractModelMetaData(code, fileName, filePath, downloadUrl, dbId) {
    if (isTestFile(filePath)) return


    let ast
    try { ast = safeParse(code) } catch { return }


    // Collect all Schema definitions keyed by variable name
    const schemas = {}
    traverse(ast, {
        VariableDeclarator({ node }) {
            if (!node.id?.name || !node.init) return
            const init = node.init
            const isSchema =
                (init.type === 'NewExpression' || init.type === 'CallExpression') &&
                init.callee?.type === 'MemberExpression' &&
                init.callee.property?.name === 'Schema'
            if (isSchema && init.arguments?.[0]?.type === 'ObjectExpression') {
                schemas[node.id.name] = {
                    definition: init,
                    fieldsNode: init.arguments[0]
                }
            }
        }
    })


    // Match mongoose.model('Name', schemaVar) to collected schemas
    const results = []
    traverse(ast, {
        CallExpression(nodePath) {
            const node = nodePath.node
            if (node.callee?.type !== 'MemberExpression') return
            if (node.callee.property?.name !== 'model') return
            if (node.arguments.length < 2) return


            const modelName = node.arguments[0]?.value
            if (!modelName) return


            const schemaVarName = node.arguments[1]?.name
            const schemaInfo = schemaVarName ? schemas[schemaVarName] : null


            const schema = {}
            if (schemaInfo?.fieldsNode) {
                schemaInfo.fieldsNode.properties.forEach(prop => {
                    const fieldName = prop.key?.name || prop.key?.value
                    if (fieldName) schema[fieldName] = extractFieldDef(prop.value)
                })
            }


            results.push({
                name: modelName,
                schema,
                location: { start: node.loc.start, end: node.loc.end },
                code: code.slice(node.start, node.end),
                schemaCode: schemaInfo
                    ? code.slice(schemaInfo.definition.start, schemaInfo.definition.end)
                    : '',
                file: fileName,
                filePath,
                downloadUrl
            })
        }
    })


    for (const data of results) {
        await sendToKafka('summary-topic', { db: dbId, type: 'model', data })
    }
}


function extractFieldDef(node) {
    if (!node) return { type: 'Mixed' }
    if (node.type === 'Identifier') return { type: node.name }
    if (node.type === 'MemberExpression') return { type: node.property?.name || 'Mixed' }
    if (node.type !== 'ObjectExpression') return { type: 'Mixed' }


    const def = {}
    const handlers = {
        type: v => v.type === 'Identifier' ? v.name : (v.property?.name || v.value || 'Mixed'),
        required: v => v.value,
        unique: v => v.value,
        index: v => v.value,
        ref: v => v.value,
        trim: v => v.value,
        lowercase: v => v.value,
        uppercase: v => v.value,
        min: v => v.value,
        max: v => v.value,
        minlength: v => v.value,
        maxlength: v => v.value,
        enum: v => v.type === 'ArrayExpression' ? v.elements.map(e => e.value) : undefined,
        default: v => {
            if (v.type === 'MemberExpression') return `${v.object?.name}.${v.property?.name}`
            return v.value
        }
    }


    node.properties.forEach(prop => {
        const key = prop.key?.name
        if (key && handlers[key]) {
            const val = handlers[key](prop.value)
            if (val !== undefined) def[key] = val
        }
    })


    return Object.keys(def).length ? def : { type: 'Mixed' }
}


module.exports = {
    extractRoutesMetaData,
    extractFunctionMetaData,
    extractModelMetaData
}



