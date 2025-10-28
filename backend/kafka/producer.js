const { Kafka, Partitioners } = require('kafkajs')

const kafka = new Kafka({
  clientId: 'github-explain',
  brokers: ['localhost:9092'],
})

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner
})

async function sendToKafka(topic, message) {
  await producer.connect()
  await producer.send({
    topic,
    messages: [{ value: JSON.stringify(message) }],
  })
  await producer.disconnect()
}

module.exports = { sendToKafka }
