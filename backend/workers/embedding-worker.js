const { createConsumer } = require('../kafka/consumer')
const { generateEmbeddings } = require('../utils/search-helper')

async function onMessage(data) {
  console.log('[Embedding Worker] Received summarized function:', data.name)
  const embedding = await generateEmbeddings(data.textsummary)
  const record = { ...data, embedding }
  // await saveToDB(record)
  console.log('[Embedding Worker] Embedding generated and saved to DB.')
}

createConsumer('embedding-group', 'embedding-topic', onMessage).catch(console.error)
