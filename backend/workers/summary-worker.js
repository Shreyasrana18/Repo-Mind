const { createConsumer } = require('../kafka/consumer')
const { sendToKafka } = require('../kafka/producer')
const { generateTextSummary } = require('../utils/summarize-tool')

async function onMessage(meta) {
  const { db, type, data } = meta
  console.log('[Summary Worker] Received function:', data.name)

  const summary = await generateTextSummary(data, type)
  const enrichedData = { ...data, textsummary: summary }

  console.log('[Summary Worker] Generated summary, sending to embedding-topic...')
  await sendToKafka('embedding-topic', { db: db, data: enrichedData })
}

createConsumer('summary-group', 'summary-topic', onMessage).catch(console.error)
