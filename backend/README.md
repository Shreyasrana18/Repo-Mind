# 📌 What This Project Does

## 🧾 Non-Technical Overview

This system analyzes a GitHub repository and transforms it into a searchable, AI-powered knowledge base. It:

- Reads all files in the repository.
- Understands the structure and functions.
- Generates summaries for key components.
- Stores the processed data in a searchable format.

After processing, you can search the project and get intelligent answers based strictly on the repository’s actual code and metadata.

---

## ⚙ Technical Overview

### Step 1: Repository Parsing (Backend)

- The backend receives a GitHub repository URL.
- Recursively parses the entire codebase to extract:
    - Functions
    - Routes
    - Middleware
    - Models
    - File metadata
- Builds structured metadata objects.
- Sends metadata to Kafka.

---

### Step 2: Summary Generation (Kafka → Summary Worker)

- The **summary worker** consumes metadata messages from Kafka.
- An LLM generates a concise `text_summary` for each metadata unit.
- The enriched metadata is forwarded to the next stage.

---

### Step 3: Embedding Generation (Kafka → Embedding Worker)

- The **embedding worker** consumes summarized metadata.
- Calls the Python embedding service to generate vector embeddings for each `text_summary`.
- Stores the final structured metadata and embeddings into PostgreSQL (pgvector).

---

### Step 4: Semantic Search

- A user submits a search query.
- The query is embedded into a vector.
- A vector similarity search runs against stored embeddings.
- Top relevant metadata is returned.
- Responses are generated strictly from stored repository metadata.

---

## 🏗 High-Level Flow

```
GitHub Repo URL
↓
Backend Parser
↓
Kafka
↓
Summary Worker (LLM)
↓
Embedding Worker (Vector Generation)
↓
PostgreSQL (pgvector)
↓
Semantic Search API
```




# Kafka (Single-Node) in Docker

This guide demonstrates how to run a **single-node Kafka broker (broker + controller)** using the official `apache/kafka` image for local development.

---

## Prerequisites

Ensure the following are installed and running:

- Docker
- Node.js (v18+ recommended)
- Python 3.8+
- PostgreSQL
- Backend dependencies (`npm install`)

---

## 1️⃣ Start Kafka

### Stop and Remove Existing Kafka Container

```bash
docker stop kafka || true
docker rm kafka || true
```

### Run Kafka

```bash
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

Kafka will be available at: `localhost:9092`

---

## 2️⃣ Verify Kafka

### Create a Test Topic

```bash
docker exec -it kafka kafka-topics.sh \
    --create \
    --topic test-topic \
    --bootstrap-server localhost:9092 \
    --partitions 3 \
    --replication-factor 1
```

### List Topics

```bash
docker exec -it kafka kafka-topics.sh \
    --list \
    --bootstrap-server localhost:9092
```

---

## 3️⃣ Run Backend (Node.js)

### Navigate to Backend Root

```bash
cd /Users/shreyasrana/Development/Personal/github-explain/backend
```

### Install Dependencies (if not done)

```bash
npm install
```

### Start Backend

- **Production Mode**: `npm start`
- **Development Mode (nodemon)**: `npm run dev`

---

## 4️⃣ Run Workers (Node.js)

From the backend root:

- **Embedding Worker**: `npm run embedding-worker`
- **Summary Worker**: `npm run summary-worker`

These correspond to the following scripts in `package.json`:

```json
"scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "embedding-worker": "node workers/embedding-worker.js",
    "summary-worker": "node workers/summary-worker.js"
}
```

---

## 5️⃣ Run Python Embedding Service (FastAPI / Uvicorn)

### Navigate to the Embeddings Directory

```bash
cd /Users/shreyasrana/Development/Personal/github-explain/backend/embedding
```

### Start the Service

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

The service will be available at: [http://localhost:8000](http://localhost:8000)

---

## 🛑 Stop Kafka

```bash
docker stop kafka
docker rm kafka
```

---

## 🔎 Architecture Overview

```
Client → Node Backend → Kafka → Workers →
                                         ↓
                                Python Embedding Service
                                         ↓
                                PostgreSQL (pgvector)
```

- **Backend** produces Kafka messages.
- **Workers** consume messages.
- **Embedding Worker** calls the Python embedding service.
- Results are stored in **PostgreSQL (pgvector)**.

---

## ⚠ Notes

- This setup is for local development only.
- Kafka runs in PLAINTEXT mode.
- Single broker, no replication safety.
- `KAFKA_AUTO_CREATE_TOPICS_ENABLE=true` is for development only.
- For multi-machine access, update the advertised listeners accordingly.