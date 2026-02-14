"""Quick MongoDB Atlas connection test."""
from dotenv import load_dotenv
load_dotenv()

import os, asyncio, certifi
from motor.motor_asyncio import AsyncIOMotorClient

async def main():
    uri = os.getenv("MONGO_URI", "")
    print(f"URI prefix: {uri[:60]}...")
    client = AsyncIOMotorClient(uri, tls=True, tlsAllowInvalidCertificates=True, serverSelectionTimeoutMS=10_000)
    try:
        result = await client.admin.command("ping")
        print("PING OK:", result)
        db = client["smartgrid_home"]
        cols = await db.list_collection_names()
        print("Collections:", cols)
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {str(e)[:300]}")
    finally:
        client.close()

asyncio.run(main())
