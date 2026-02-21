const fs = require('fs/promises')
const path = require('path')
const axios = require('axios')
require('dotenv').config()
const DOMAIN_URL = "http://172.20.10.2:11434"
const contextSearch = async (prompt) => {
    try {
        const res = await axios.post(
            `${DOMAIN_URL}/api/generate`,
            {
                model: 'mistral:7b-instruct-q4_K_M',
                prompt,
                stream: false,
                options: {
                    temperature: 0.2,
                    top_p: 0.9
                }
            }
        )
        return res.data?.response?.trim() || ''
    } catch (err) {
        console.error('Error generating context answer:', err.response?.data || err.message)
        return ''
    }
}

module.exports = { contextSearch }
const callLlmGenerate = async (prompt, record) => {
    try {
        const res = await axios.post(
            `${DOMAIN_URL}/api/generate`,
            {
                model: 'mistral:7b-instruct-q4_K_M',
                prompt,
                stream: false
            }
        )
        return (res.data?.response || '').trim()

    } catch (err) {
        console.error(
            `Error generating summary for ${record?.file || record?.name}:`,
            err.response?.data || err.message
        )
        return ''
    }
}
const generateCodeSummary = async (record, type) => {
    let content = ''

    if (type === 'function') {
        content = `File Name: ${record.file}\nFunction Name: ${record.name}\nFunction Type: ${record.type}\nFunctions Used: ${record.functionsUsed?.map(f => f.name).join(', ') || 'None'}`
    }

    else if (type === 'route') {
        const middlewares = record.middlewares?.map(mw => `${mw.name} (from ${mw.importedFrom})`).join(', ') || 'None'
        const handler = record.handler ? `${record.handler.name} (from ${record.handler.importedFrom})` : 'Unknown'
        content = `Route Path: ${record.path}\nMethod: ${record.method}\nHandler Function: ${handler}\nMiddlewares: ${middlewares}\nSource File: ${record.file}`
    }

    else if (type === 'model') {
        content = `Model Name: ${record.name}\nDefined in: ${record.file}\nSchema Fields: ${Object.keys(record.schema || {}).join(', ')}\nSchema Definition Preview: ${record.schemaCode?.slice(0, 300)}...`
    }

    const prompt = `Given the following code metadata, write a short 1–2 sentence summary describing what the code does:\n\n${content}`
    return await callLlmGenerate(prompt, record)
}

module.exports = { generateCodeSummary, contextSearch, callLlmGenerate }