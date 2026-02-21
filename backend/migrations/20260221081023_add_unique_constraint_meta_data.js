/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
   const hasTable = await knex.schema.hasTable('meta_data')
   if (hasTable) {
       await knex.schema.alterTable('meta_data', (table) => {
           table.unique(['type', 'name', 'file', 'path'], 'unique_meta_data')
       })
   }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  const hasTable = await knex.schema.hasTable('meta_data')
  if (hasTable) {
    await knex.schema.alterTable('meta_data', (table) => {
      table.dropUnique(['type', 'name', 'file', 'path'], 'unique_meta_data')
    })
  }
};
