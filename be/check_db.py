"""Quick script to check what's in the scans collection."""
from dotenv import load_dotenv
load_dotenv()

import os
from pymongo import MongoClient

uri = os.getenv("MONGO_URI")
db_name = os.getenv("MONGO_DB", "smartgrid_home")

client = MongoClient(uri, serverSelectionTimeoutMS=10000)
db = client[db_name]

count = db["scans"].count_documents({})
print(f"Total scans in DB: {count}\n")

docs = list(
    db["scans"]
    .find({}, {"imageBase64": 0})  # exclude the big base64 blob
    .sort("createdAt", -1)
    .limit(10)
)

for d in docs:
    print(f"  _id:      {d['_id']}")
    print(f"  filename: {d.get('filename', 'N/A')}")
    print(f"  size:     {d.get('sizeBytes', 'N/A')} bytes")
    print(f"  type:     {d.get('contentType', 'N/A')}")
    print(f"  status:   {d.get('status', 'N/A')}")
    print(f"  created:  {d.get('createdAt', 'N/A')}")
    print()

client.close()
