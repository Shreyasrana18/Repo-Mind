const fs = require('fs/promises')
const path = require('path')
const axios = require('axios')
require('dotenv').config()
const API_KEY = process.env.ai_key
const API_KEY_HORIZON = process.env.ai_key_2
const API_KEY_GPT = process.env.ai_key_gpt

const generateTextSummaryMetaLlama = async (prompt, record) => {
    try {
        const res = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'meta-llama/llama-3.2-3b-instruct:free',
                messages: [{ role: 'user', content: prompt }]
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY}`
                }
            }
        )
        return res.data.choices?.[0]?.message?.content?.trim() || ''
    } catch (err) {
        console.error(`Error generating summary (Meta Llama) for ${record.file || record.name}: ${err.message}`)
        return ''
    }
}
const contextSearch = async (prompt) => {
    try {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt }
                ]
            }
        ]
        const res = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-oss-20b:free',
                messages
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY_GPT}`
                }
            }
        )
        return res.data.choices?.[0]?.message?.content?.trim() || ''
    } catch (err) {
        console.error(`Error generating summary: ${err.message}`)
        return ''
    }
}
const generateTextSummaryHorizonBeta = async (prompt, record) => {
    try {
        const messages = [
            {
                role: 'user',
                content: [
                    { type: 'text', text: prompt }
                ]
            }
        ]
        const res = await axios.post(
            'https://openrouter.ai/api/v1/chat/completions',
            {
                model: 'openai/gpt-oss-20b:free',
                messages
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API_KEY_HORIZON}`
                }
            }
        )
        return res.data.choices?.[0]?.message?.content?.trim() || ''
    } catch (err) {
        console.error(`Error generating summary (Horizon Beta) for ${record.file || record.name}: ${err.message}`)
        return ''
    }
}
const generateTextSummary = async (record, type) => {
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
    return await generateTextSummaryHorizonBeta(prompt, record)
}

const enrichAllMetadata = async (inputFilePath) => {
    const parsed = JSON.parse(await fs.readFile(inputFilePath, 'utf-8'))
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

    const enrichArray = async (arr, type) => {
        for (const record of arr) {
            if (!record.textSummary || record.textSummary.trim() === '') {
                const summary = await generateTextSummary(record, type)
                console.log(`Generated summary for ${type} ${record.name || record.file}`)
                record.textSummary = summary
                await delay(5000)
            }
        }
    }

    await enrichArray(parsed.functionResults, 'function')
    await enrichArray(parsed.routeResults, 'route')
    await enrichArray(parsed.modelResults, 'model')

    await fs.writeFile(inputFilePath, JSON.stringify(parsed, null, 2), 'utf-8')
    console.log(`✅ Metadata enriched and saved to ${path.basename(inputFilePath)}`)
}

module.exports = { enrichAllMetadata, generateTextSummaryHorizonBeta, contextSearch }