const { Client } = require('pg')
require('dotenv').config()

const client = new Client({
  host: process.env.PG_HOST || '127.0.0.1',
  port: process.env.PG_PORT ? Number(process.env.PG_PORT) : 5433,
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_USER_PASSWORD || process.env.PG_PASSWORD || 'postgres',
  database: process.env.PG_DATABASE || 'githubexplain'
})

async function initDB() {
  await client.connect()
  try {
    await client.query(`CREATE EXTENSION IF NOT EXISTS vector`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_owner (
        id SERIAL PRIMARY KEY,
        repo_id VARCHAR(255)
      )
    `)
    await client.query(`
      CREATE TABLE IF NOT EXISTS meta_data (
      id SERIAL PRIMARY KEY,
      owner_id INT REFERENCES meta_owner(id),
      type meta_data_type,
      name TEXT,
      code TEXT,
      location_start JSONB,
      location_end JSONB,
      download_url TEXT,
      functions_used JSONB,
      route_results JSONB,
      model_results JSONB,
      file TEXT,
      path TEXT,
      text_summary TEXT,
      embedding vector(1536),
      language VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
      )
    `)
  } catch (err) {
    throw err
  }
}
module.exports = {
  client,
  initDB,
  TABLES: {
    MetaOwner: 'meta_owner',
    MetaData: 'meta_data'
  }
}
