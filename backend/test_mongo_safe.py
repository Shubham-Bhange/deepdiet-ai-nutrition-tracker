import os, urllib.parse
from pymongo import MongoClient

mongo_url = os.environ.get("MONGO_URL")
if not mongo_url:
    print("NO MONGO URL!")
else:
    try:
        client = MongoClient(mongo_url)
        db = client["deepdiet"]
        count = db["scans"].count_documents({})
        print("Total scans:", count)
        
        latest = list(db["scans"].find({}, {"_id": 0}).sort("timestamp", -1).limit(1))
        if latest:
            print("Latest:", latest[0])
    except Exception as e:
        print("Mongo Error:", e)
