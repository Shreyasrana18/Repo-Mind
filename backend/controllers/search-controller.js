const searchUtil = require('../utils/search-helper')
const { contextSearch } = require('../utils/summarize-tool')

async function search(req, res) {
    try {
        const { q } = req.query
        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Invalid or missing query parameter' })
        }
        const categories = searchUtil.detectCategories(q) // TODO make this more flexible and score wise detect categories
        const results = await searchUtil.searchInCategories(q, categories)
        const prompt = searchUtil.buildPrompt(q, results)
        const answer = await contextSearch(prompt)

        res.json({ query: q, categories, answer, sources: results })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Search failed' })
    }
}

module.exports = { search }