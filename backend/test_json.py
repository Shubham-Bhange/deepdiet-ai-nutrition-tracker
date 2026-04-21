import os
from PIL import Image
from google import genai
import json
import re

client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

prompt = """
You are DeepDiet AI — a professional Indian food nutrition analyst.
Analyze the uploaded food image carefully...
Return JSON only.
"""

img = Image.new('RGB', (100, 100), color = 'red')

try:
    print("Testing gemini-2.5-flash-lite...")
    response = client.models.generate_content(
        model="gemini-2.5-flash-lite",
        contents=[prompt, img]
    )
    print("RAW Response:", response.text)
except Exception as e:
    import traceback
    print("Error:")
    traceback.print_exc()

