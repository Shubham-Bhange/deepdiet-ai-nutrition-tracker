import os, io
from PIL import Image
from google import genai
import re, json

API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=API_KEY)

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

prompt = """
You are DeepDiet AI — a professional Indian food nutrition analyst.
Analyze the uploaded food image carefully.
Return JSON only.
"""

img = Image.new('RGB', (100, 100), color = 'red')

models_to_try = [
    "gemini-2.5-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
    "gemini-2.5-flash-lite"
]

response = None
for m in models_to_try:
    for attempt in range(2):
        try:
            print(f"Trying {m} attempt {attempt+1}")
            response = client.models.generate_content(model=m, contents=[prompt, img])
            print("SUCCESS with", m)
            break
        except Exception as e:
            print(f"FAILED {m}:", e)
    if response: break

if response:
    print("RAW TEXT:")
    print(response.text)
    data = extract_json(response.text)
    print("PARSED JSON:")
    print(data)
