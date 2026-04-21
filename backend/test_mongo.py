import pymongo
import os

client = pymongo.MongoClient(os.getenv("MONGO_URL"))
db = client["deepdiet"]
scans = list(db["scans"].find({}, {"_id": 0}).sort("timestamp", -1))
print("Total scans:", len(scans))
if scans:
    print("Latest scan userId:", scans[0].get("userId"))
    print("Latest scan timestamp:", scans[0].get("timestamp"))
