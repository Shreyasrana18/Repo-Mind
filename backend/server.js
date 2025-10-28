const express = require('express')
require('dotenv').config()
const route = require('./routes/routes')
const cors = require('cors')
const { initDB, client } = require('./db/pg') // import initDB and client
const app = express()
const PORT = process.env.PORT || 5002

app.use(cors('*'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', route)

// Initialize DB then start the server
;(async () => {
    try {
        await initDB()
        const server = app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`)
        })

        // graceful shutdown: close http server and pg client
        const shutdown = async () => {
            console.log('Shutting down...')
            server.close(async () => {
                await client.end().catch(() => {})
                process.exit(0)
            })
        }

        process.on('SIGINT', shutdown)
        process.on('SIGTERM', shutdown)
    } catch (err) {
        console.error('Failed to initialize DB:', err)
        process.exit(1)
    }
})()