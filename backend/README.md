# Kafka (single-node) in Docker

This README shows a simple way to run a single-node Kafka broker (broker + controller) using the official apache/kafka image.

## Prerequisites
- Docker installed and running

## Start Kafka
Run the following (stops & removes any existing `kafka` container first):

```bash
docker stop kafka || true
docker rm kafka || true

docker run -d \
    --name kafka \
    -p 9092:9092 \
    -e KAFKA_NODE_ID=1 \
    -e KAFKA_PROCESS_ROLES=broker,controller \
    -e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093 \
    -e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://localhost:9092 \
    -e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER \
    -e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT \
    -e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093 \
    -e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1 \
    -e KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR=1 \
    -e KAFKA_TRANSACTION_STATE_LOG_MIN_ISR=1 \
    -e KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS=0 \
    -e KAFKA_NUM_PARTITIONS=3 \
    -e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true \
    -e CLUSTER_ID=5L6g3nShT-eMCtK--X86sw \
    apache/kafka:latest
```

This exposes Kafka on localhost:9092. The configuration runs Kafka as both broker and controller (suitable for local dev/testing).

## Verify
List topics or create one using the container's kafka tools (adjust path if different in the image):

```bash
# create a topic
docker exec -it kafka kafka-topics.sh --create --topic test-topic --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1

# list topics
docker exec -it kafka kafka-topics.sh --list --bootstrap-server localhost:9092
```

## Stop & remove
```bash
docker stop kafka
docker rm kafka
```

Notes:
- This setup is for local development/testing only (single-node, PLAINTEXT). For production use a multi-node cluster with proper security and replication.
- If you need external access from other machines, change KAFKA_ADVERTISED_LISTENERS to an appropriate host/IP.
- Adjust CLUSTER_ID or remove it if you want Kafka to auto-generate one.
- KAFKA_AUTO_CREATE_TOPICS_ENABLE=true will auto-create topics on first use — disable in stricter environments.