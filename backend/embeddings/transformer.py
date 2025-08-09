import json
from sentence_transformers import SentenceTransformer
import os

model = SentenceTransformer('all-MiniLM-L6-v2')

input_path = 'controllers/Shreyasrana18-Notes-API-functions.json'

if not os.path.exists(input_path):
    raise FileNotFoundError(f"Input file not found: {input_path}")

with open(input_path, 'r') as f:
    data = json.load(f)

# Only loop through entries with textSummary
for section in ["functionResults","routeResults","modelResults"]:
    records = data.get(section, [])
    for record in records:
        summary = record.get('textSummary')
        if summary:
            record['embedding'] = model.encode(summary, normalize_embeddings=True).tolist()
            print(f"✅ Embedded {record.get('name', 'unnamed')} from {section}")

# Save back to file
with open(input_path, 'w') as f:
    json.dump(data, f, indent=2)

print(f"\n🎉 Embeddings added to: {input_path}")
