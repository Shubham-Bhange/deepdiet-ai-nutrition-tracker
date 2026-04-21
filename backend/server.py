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
import time
import asyncio

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
        "http://127.0.0.1:5500",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# DATABASE
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
# AUTH SYSTEM (PBKDF2 - Stable)
# =====================================================

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(
    schemes=["pbkdf2_sha256"],
    deprecated="auto"
)

security = HTTPBearer()

def hash_password(password: str):
    return pwd_context.hash(password)

def verify_password(plain, hashed):
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict):
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode = data.copy()
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=ALGORITHM)

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
# DISH SCAN (Gemini Vision)
# =====================================================

@app.post("/api/dish-scan")
async def dish_scan(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    try:
        img_bytes = await file.read()
        image = Image.open(io.BytesIO(img_bytes)).convert("RGB")

        prompt = """
You are DeepDiet AI — a professional Indian food nutrition analyst.

Analyze the uploaded food image carefully.

You MUST:
- Identify Indian dishes accurately (North, South, Street food, Sweets, Restaurant meals, Home meals).
- Detect multiple items if present (example: roti + dal + sabzi + rice).
- Estimate realistic Indian portion sizes.
- Provide accurate calorie and macro estimates based on common Indian cooking methods.

Return STRICT JSON only.
Do NOT include explanation text.
Do NOT include markdown.
Do NOT include comments.

Output format:

{
  "meal_name": "string",
  "dish_level": true or false,
  "dish_meta": {
    "portion_label": "small | medium | large",
    "estimated_grams": number,
    "confidence": number (0-100),
    "notes": "short explanation of assumptions"
  },
  "items": [
    {
      "name": "string",
      "portion_text": "e.g. 2 rotis | 1 bowl dal | 1 plate biryani",
      "calories": number
    }
  ],
  "totals": {
    "calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "health_score": number (0-100)
}

Rules:

1. If full restaurant-style dish (biryani, fried rice, pizza, thali, etc.), set dish_level = true.
2. If clearly separate homemade items, set dish_level = false.
3. Use typical Indian portion standards:
   - 1 roti ≈ 100 kcal
   - 1 bowl dal ≈ 180–220 kcal
   - 1 cup rice ≈ 200 kcal
   - 1 samosa ≈ 250 kcal
   - 1 plate biryani ≈ 700–900 kcal
   - 1 dosa ≈ 300–400 kcal
4. Estimate oil usage realistically (Indian cooking often includes visible oil).
5. Avoid extreme numbers.
6. Health score guidelines:
   - 80–100: balanced, low oil, high protein
   - 60–79: moderate
   - 40–59: high carb or oil
   - 0–39: fried / sugary / high fat

If unsure:
- Make best reasonable assumption.
- Never return empty fields.
- Never return null.

Return JSON only.
"""

        models_to_try = [
            "gemini-2.5-flash",   # Primary
            "gemini-1.5-pro",     # Failsafe 1
            "gemini-1.5-flash",   # Failsafe 2
            "gemini-2.5-flash-lite" # Final Failsafe
        ]

        response = None
        last_exception = None
        max_retries = 2
        
        for model_name in models_to_try:
            for attempt in range(max_retries):
                try:
                    response = client.models.generate_content(
                        model=model_name,
                        contents=[prompt, image]
                    )
                    break # Success!
                except Exception as e:
                    print(f"Model {model_name} failed on attempt {attempt + 1} ({e}).")
                    last_exception = e
                    if attempt < max_retries - 1:
                        print("Retrying in 1 second...")
                        await asyncio.sleep(1)
            
            if response:
                break
            else:
                print(f"Model {model_name} exhausted all retries, using next fallback...")

        if not response:
            raise RuntimeError(f"All fallback models failed. Last error: {last_exception}")

        data = extract_json(response.text)

        if not data:
            raise ValueError("Gemini JSON parsing failed")

        # Prepare clean document
        clean_doc = {
            **data,
            "id": str(datetime.utcnow().timestamp()),
            "timestamp": datetime.utcnow().isoformat(),
            "userId": user_id
        }

        # Insert into Mongo
        result = scans_collection.insert_one(clean_doc)

        # Remove Mongo _id before returning
        clean_doc["_id"] = str(result.inserted_id)

        return clean_doc

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# =====================================================
# HISTORY
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
# CHATBOT
# =====================================================

@app.post("/api/chat")
def chat_with_ai(
    req: ChatRequest,
    user_id: str = Depends(get_current_user)
):

    prompt = f"""
You are DeepDiet AI.

User Question:
{req.message}

Meal Context:
{json.dumps(req.context)}

Give short, clear advice.
"""

    models_to_try = [
        "gemini-2.5-flash",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-2.5-flash-lite"
    ]

    response = None
    last_exception = None
    max_retries = 2

    for model_name in models_to_try:
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt
                )
                break
            except Exception as e:
                print(f"Chat model {model_name} failed on attempt {attempt + 1} ({e}).")
                last_exception = e
                if attempt < max_retries - 1:
                    print("Retrying in 1 second...")
                    time.sleep(1)
        
        if response:
            break
        else:
            print(f"Chat model {model_name} exhausted all retries, using next fallback...")

    if not response:
        raise RuntimeError(f"All chat fallback models failed. Last error: {last_exception}")

    return {"reply": response.text.strip()}

# =====================================================
# ROOT
# =====================================================

@app.get("/")
def root():
    return {"status": "DeepDiet backend running"}