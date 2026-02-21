const searchUtil = require('../utils/search-helper')
const { contextSearch } = require('../utils/summarize-tool')

async function search(req, res) {
    try {
        const { q } = req.query
        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing query parameter' })
        }
        const results = await searchUtil.searchInCategories(q)
        const prompt = searchUtil.buildPrompt(q, results)
        const answer = await contextSearch(prompt)

        res.json({ query: q, answer, sources: results })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Search failed' })
    }
}

module.exports = { search }