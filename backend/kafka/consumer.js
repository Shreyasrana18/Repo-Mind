const { Kafka } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'github-explain',
  brokers: ['localhost:9092'],
})

async function createConsumer(groupId, topic, onMessage) {
  const consumer = kafka.consumer({ groupId })

  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: false })

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const data = JSON.parse(message.value.toString())
        await onMessage(data)
      } catch (err) {
        console.error(`[${groupId}] Error processing message from ${topic}:`, err)
      }
    },
  })

  console.log(`[${groupId}] Listening to topic: ${topic}`)
}

module.exports = { createConsumer }