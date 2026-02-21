const { createConsumer } = require('../kafka/consumer')
const { generateEmbeddings } = require('../utils/search-helper')
const { saveMetaData } = require('../utils/db-functions')

async function onMessage(meta) {
  const { db, data } = meta
  console.log('[Embedding Worker] Received summarized function:', data?.name)
  const embedding = await generateEmbeddings(data?.textSummary)
  const record = { ...data, embedding }
  await saveMetaData(db, record)
  console.log('[Embedding Worker] Embedding generated and saved to DB.')
}

createConsumer('embedding-group', 'embedding-topic', onMessage).catch(console.error)
