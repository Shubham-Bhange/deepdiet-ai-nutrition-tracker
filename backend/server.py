from fastapi import FastAPI, UploadFile, File, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from google import genai
from PIL import Image
from pymongo import MongoClient
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta
import io
import os
import json
import re

# =====================================================
# ENV VARIABLES
# =====================================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MONGO_URL = os.getenv("MONGO_URL")
JWT_SECRET = os.getenv("JWT_SECRET")

if not GEMINI_API_KEY:
    raise RuntimeError("GEMINI_API_KEY not set")

if not MONGO_URL:
    raise RuntimeError("MONGO_URL not set")

if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET not set")

# =====================================================
# FASTAPI SETUP
# =====================================================

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://deepdiet.vercel.app",
        "http://localhost:5500",
        "http://127.0.0.1:5500"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# DATABASE (MongoDB Atlas)
# =====================================================

mongo_client = MongoClient(MONGO_URL)
db = mongo_client["deepdiet"]

users_collection = db["users"]
scans_collection = db["scans"]
profiles_collection = db["profiles"]

# =====================================================
# GEMINI CLIENT
# =====================================================

client = genai.Client(api_key=GEMINI_API_KEY)

# =====================================================
# AUTH SYSTEM
# =====================================================

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    data.update({"exp": expire})
    return jwt.encode(data, JWT_SECRET, algorithm=ALGORITHM)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[ALGORITHM])
        user_id = payload.get("userId")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

# =====================================================
# HELPERS
# =====================================================

def extract_json(text: str):
    if not text:
        return None
    text = re.sub(r"```json|```", "", text).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(text[start:end + 1])
    except:
        return None

# =====================================================
# REQUEST MODELS
# =====================================================

class RegisterRequest(BaseModel):
    userId: str
    password: str
    fullName: str

class LoginRequest(BaseModel):
    userId: str
    password: str

class ChatRequest(BaseModel):
    message: str
    context: dict | None = None

# =====================================================
# AUTH ENDPOINTS
# =====================================================

@app.post("/api/register")
def register(req: RegisterRequest):

    if users_collection.find_one({"userId": req.userId}):
        return {"ok": False, "msg": "User already exists"}

    users_collection.insert_one({
        "userId": req.userId,
        "fullName": req.fullName,
        "password": hash_password(req.password),
        "createdAt": datetime.utcnow()
    })

    return {"ok": True, "msg": "Registered successfully"}


@app.post("/api/login")
def login(req: LoginRequest):

    user = users_collection.find_one({"userId": req.userId})

    if not user or not verify_password(req.password, user["password"]):
        return {"ok": False, "msg": "Invalid credentials"}

    token = create_access_token({"userId": req.userId})

    return {
        "ok": True,
        "token": token,
        "fullName": user.get("fullName", "")
    }

# =====================================================
# DISH SCAN ENDPOINT (Gemini Vision)
# =====================================================

@app.post("/api/dish-scan")
async def dish_scan(file: UploadFile = File(...), user_id: str = Depends(get_current_user)):

    try:
        img_bytes = await file.read()
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        prompt = """
You are a food nutrition AI.

Analyze the image carefully.

Return STRICT JSON only in this format:

{
  "meal_name": "string",
  "dish_level": true,
  "dish_meta": {
    "portion_label": "small | medium | large",
    "estimated_grams": number,
    "confidence": number,
    "notes": "short explanation"
  },
  "items": [
    {
      "name": "string",
      "portion_text": "e.g. 2 rotis",
      "calories": number
    }
  ],
  "totals": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "health_score": number
}

Rules:
- Estimate realistic Indian food portions.
- If it is restaurant style, use dish_level = true.
- Health score from 0 to 100.
- DO NOT include any text outside JSON.
"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt, image]
        )

        data = extract_json(response.text)

        if not data:
            raise ValueError("Gemini JSON parsing failed")

        data["id"] = str(datetime.utcnow().timestamp())
        data["timestamp"] = datetime.utcnow()
        data["userId"] = user_id

        scans_collection.insert_one(data)

        return data

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================
# HISTORY ENDPOINT
# =====================================================

@app.get("/api/history")
def get_history(user_id: str = Depends(get_current_user)):

    scans = list(
        scans_collection.find(
            {"userId": user_id},
            {"_id": 0}
        ).sort("timestamp", -1)
    )

    return scans

# =====================================================
# CHATBOT ENDPOINT
# =====================================================

@app.post("/api/chat")
def chat_with_ai(req: ChatRequest, user_id: str = Depends(get_current_user)):

    prompt = f"""
You are DeepDiet AI nutrition assistant.

User Question:
{req.message}

Meal Context:
{json.dumps(req.context)}

Give short, clear, friendly advice.
"""

    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt
    )

    return {"reply": response.text.strip()}

# =====================================================
# ROOT
# =====================================================

@app.get("/")
def root():
    return {"status": "DeepDiet backend running"}