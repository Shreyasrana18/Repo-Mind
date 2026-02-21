const db = require('../db/knex')

async function saveMetaData(ownerId, data) {
    const ownerExists = await db('meta_owner')
        .where({ id: ownerId })
        .first()

    if (!ownerExists) {
        throw new Error(`No meta_owner found with id ${ownerId}`)
    }

    const record = {
        owner_id: ownerId,
        type: data.type ?? null,
        name: data.name ?? null,
        code: data.code ?? null,
        location_start: data.location?.start
            ? JSON.stringify(data.location.start)
            : null,
        location_end: data.location?.end
            ? JSON.stringify(data.location.end)
            : null,
        download_url: data.downloadUrl ?? null,
        functions_used: data.functionsUsed
            ? JSON.stringify(data.functionsUsed)
            : null,
        route_results: data.route_results
            ? JSON.stringify(data.route_results)
            : null,
        model_results: data.model_results
            ? JSON.stringify(data.model_results)
            : null,
        file: data.file ?? null,
        path: data.filePath ?? null,
        text_summary: data.textSummary ?? null,
        embedding: Array.isArray(data.embedding)
            ? db.raw('?::vector', [JSON.stringify(data.embedding)])
            : null,

        language: data.language ?? 'javascript'
    }
    const [row] = await db('meta_data')
        .insert(record)
        .onConflict(['type', 'name', 'file', 'path'])
        .merge()
        .returning('*')

    return row
}

module.exports = { saveMetaData }