const axios = require("axios")
const cosine = require("../utils/cosine")
const embeddingStore = require("./Shreyasrana18-Notes-API-functions.json")

async function search(req, res) {
    const { q } = req.query

    const response = await axios.post("http://127.0.0.1:8001/generate-embeddings", {
        texts: [q]
    })

    const { embeddings } = response.data
    const queryEmbedding = embeddings[0]
    const key = "functionResults"
    const results = embeddingStore[key].map((item) => ({
        ...item,
        score: cosine.cosineSimilarity(queryEmbedding, item.embedding),
    })).sort((a, b) => b.score - a.score).slice(0, 5)

    res.json(results)
}



module.exports = { search }