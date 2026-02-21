/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Enable pgvector
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector')

  // Create meta_owner
  await knex.schema.createTable('meta_owner', (table) => {
    table.increments('id').primary()
    table.string('repo_id').notNullable().unique()
  })

  // Create meta_data
  await knex.schema.createTable('meta_data', (table) => {
    table.increments('id').primary()

    table
      .integer('owner_id')
      .references('id')
      .inTable('meta_owner')
      .onDelete('CASCADE')
      .notNullable()

    table.text('type') // no enum
    table.text('name')
    table.text('code')

    table.jsonb('location_start')
    table.jsonb('location_end')

    table.text('download_url')

    table.jsonb('functions_used')
    table.jsonb('route_results')
    table.jsonb('model_results')

    table.text('file')
    table.text('path')

    table.text('text_summary')

    // IMPORTANT: match your embedding model dimension
    table.specificType('embedding', 'vector(384)')

    table.string('language', 100).defaultTo('javascript')

    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now())
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now())

    table.index(['owner_id'])
  })

  await knex.raw(`
    CREATE INDEX meta_data_embedding_idx
    ON meta_data
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
  `)
}

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('meta_data')
  await knex.schema.dropTableIfExists('meta_owner')
}