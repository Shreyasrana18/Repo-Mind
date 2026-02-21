const express = require('express')
require('dotenv').config()
const cors = require('cors')
const route = require('./routes/routes')
const db = require('./db/knex')   

const app = express()
const PORT = process.env.PORT || 5002

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', route)

const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})

const shutdown = async () => {
  console.log('Shutting down server...')

  server.close(async () => {
    try {
      await db.destroy()
      console.log('Database pool closed.')
    } catch (err) {
      console.error('Error closing DB pool:', err)
    } finally {
      process.exit(0)
    }
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)