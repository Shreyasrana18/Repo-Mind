const axios = require("axios")
const db = require('../db/knex')


async function generateEmbeddings(texts) {
    const { data } = await axios.post("http://127.0.0.1:8000/generate-embeddings", {
        texts: [texts]
    })
    return data.embeddings[0]
}

async function searchEmbeddings(query) {
  if (!query) return []

  const queryEmbedding = await generateEmbeddings(query)

  if (!queryEmbedding?.length) {
    throw new Error('Failed to generate query embedding')
  }

  const vectorString = `[${queryEmbedding.join(',')}]`

  const results = await db('meta_data')
    .select(
      'id',
      'name',
      'file',
      'path',
      'text_summary as summary',
      db.raw('1 - (embedding <=> ?::vector) as score', [vectorString])
    )
    .whereNotNull('embedding')
    .orderByRaw('embedding <=> ?::vector', [vectorString])
    .limit(10)

  return results
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

module.exports = { buildPrompt, searchInCategories: searchEmbeddings, generateEmbeddings }