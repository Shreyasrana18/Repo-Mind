require('dotenv').config()

module.exports = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.PG_HOST || '127.0.0.1',
      port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5433,
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_USER_PASSWORD || process.env.PG_PASSWORD || 'postgres',
      database: process.env.PG_DATABASE || 'githubexplain',
    },
    migrations: {
      directory: './migrations'
    },
    pool: {
      min: 2,
      max: 10
    }
  }
}