const db = require('../db/pg')

async function saveMetaData(ownerId, data) {
    const {
        type = null,
        name = null,
        code = null,
        location_start = null,
        location_end = null,
        download_url = null,
        functions_used = null,
        route_results = null,
        model_results = null,
        file = null,
        path = null,
        text_summary = null,
        embedding = null,
        language = "javascript"
    } = data

    const recordExists = await db.client.query('SELECT * FROM meta_owner where id = $1', [ownerId])
    if (recordExists.rows.length === 0) {
        throw new Error(`No meta_owner found with id ${ownerId}`)
    }
    try {
        const res = await db.client.query(
            `
        INSERT INTO meta_data
            (owner_id, type, name, code, location_start, location_end,
             download_url, functions_used, route_results, model_results,
             file, path, text_summary, embedding, language, created_at, updated_at)
        VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::vector,$15, now(), now())
        RETURNING *
        `,
            [
                ownerId,
                type,
                name,
                code,
                location_start,
                location_end,
                download_url,
                functions_used,
                route_results,
                model_results,
                file,
                path,
                text_summary,
                embedding,
                language
            ]
        )

        return res.rows[0]
    }
    catch (err) {
        console.error('Error saving meta data:', err.message)
    }
}

module.exports = {
    saveMetaData
}
