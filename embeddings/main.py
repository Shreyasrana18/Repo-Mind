from fastapi import FastAPI, Request
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

app = FastAPI()
model = SentenceTransformer('all-MiniLM-L6-v2')

class TextRequest(BaseModel):
    texts: list[str]

@app.post("/generate-embeddings")
def generate_embeddings(req: TextRequest):
    embeddings = model.encode(req.texts, normalize_embeddings=True).tolist()
    return {"embeddings": embeddings}
