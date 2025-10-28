const axios = require("axios")
const cosine = require("./cosine")
const embeddingStore = require("../controllers/Shreyasrana18-Notes-API-functions.json")


async function generateEmbeddings(texts) {
    const { data } = await axios.post("http://127.0.0.1:8000/generate-embeddings", {
        texts: [texts]
    })
    return data.embeddings[0]
}
async function searchInCategories(query, categories) {
    let allResults = []

    const queryEmbedding = await generateEmbeddings(query)

    for (const category of categories) {
        const store = embeddingStore[category]
        if (!store) continue

        const results = store
            .map(item => ({
                name: item.name,
                summary: item.textSummary,
                score: cosine.cosineSimilarity(queryEmbedding, item.embedding)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)

        allResults.push(...results)
    }

    return allResults
}


function detectCategories(query) {
    const qLower = query.toLowerCase()
    const categories = []

    if (qLower.includes("function") || qLower.includes("method")) {
        categories.push("functionResults")
    }
    if (qLower.includes("route") || qLower.includes("endpoint") || qLower.includes("path")) {
        categories.push("routeResults")
    }
    if (qLower.includes("structure") || qLower.includes("file") || qLower.includes("folder")) {
        categories.push("structure")
    }
    if (qLower.includes("model") || qLower.includes("schema")) {
        categories.push("modelResults")
    }
    return categories
}

const buildPrompt = (userQuery, results) => {
    const contextText = results.map((item, index) =>
        `Result ${index + 1}:
            Name: ${item.name}
            Summary: ${item.summary}`
    ).join("\n\n")

    return `
            You are an AI assistant. Answer the user's question using ONLY the information provided below.
            If the answer is not contained in the provided context, say "I don't have enough information to answer that."

            User's Question:
            ${userQuery}

            Context:
            ${contextText}

            Answer in a clear and concise way.
                `.trim()
}

module.exports = { buildPrompt, detectCategories, searchInCategories, generateEmbeddings }