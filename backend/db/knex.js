// db/knex.js
const knex = require('knex')

const db = knex({
  client: 'pg',
  connection: {
    host: process.env.PG_HOST || '127.0.0.1',
    port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5433,
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_USER_PASSWORD || process.env.PG_PASSWORD || 'postgres',
    database: process.env.PG_DATABASE || 'githubexplain'
  },
  pool: { min: 2, max: 10 }
})

module.exports = db