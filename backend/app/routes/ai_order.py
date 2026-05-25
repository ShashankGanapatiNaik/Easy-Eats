# backend/app/routes/ai_order.py
"""
AI Order Parser
───────────────
POST /ai/parse-order
  Receives natural language prompt + available menu data
  Returns structured order intent: stall, items, total, confirmation message

POST /ai/chat
  Full conversational AI for the chatbot — handles ordering, suggestions,
  wallet queries, and general food Q&A.
"""
import json
import httpx
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional

from app.utils.security import get_current_user
from app.models.user import User
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["AI"])
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role:    str    # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages:       List[ChatMessage]
    wallet_balance: float = 0.0
    menu_context:   Optional[str] = None   # JSON string of available stalls+items
    last_order:     Optional[str] = None   # JSON of user's last order


class ParseOrderBody(BaseModel):
    prompt:       str
    menu_context: str    # JSON: [{stall, items:[{id,name,price,category}]}]


# ── System prompt ─────────────────────────────────────────────────────────────

def build_system(wallet: float, menu: str, last_order: str) -> str:
    return f"""You are EatsBot, the AI food assistant for Easy Eats — a campus food ordering app.
You help students order food using natural language and voice.

WALLET BALANCE: ₹{wallet:.0f}

AVAILABLE MENU (JSON):
{menu or "Not provided — tell user to browse stalls first."}

LAST ORDER: {last_order or "None"}

YOUR CAPABILITIES:
1. Parse food orders from natural language
2. Suggest items based on budget, meal time, preferences
3. Handle wallet queries
4. Confirm orders before placing

RESPONSE RULES:
- Always respond in JSON format ONLY with this structure:
{{
  "message": "Your conversational reply to the user",
  "intent": "order|suggest|wallet|confirm|chat|unclear",
  "order": {{
    "stall_id": "...",
    "stall_name": "...",
    "items": [
      {{"id":"...","name":"...","price":0,"qty":1}}
    ],
    "total": 0
  }},
  "requires_confirmation": true,
  "confirmation_message": "Confirm message shown to user before payment"
}}

- "order" field is null unless you detected a valid order intent
- "requires_confirmation" = true whenever an order is detected
- Keep "message" conversational, friendly, 1-2 sentences max
- If wallet is insufficient, say so in "message" and set intent="wallet"
- For suggestions, describe 2-3 items briefly
- Always include exact item IDs and prices from the menu JSON
- Never invent items not in the menu
- If no matching stall/item found, say so politely"""


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/chat")
async def ai_chat(
    body: ChatBody,
    current_user: User = Depends(get_current_user),
):
    """
    Full conversational AI endpoint.
    Returns JSON with message + optional order intent.
    """
    system = build_system(
        wallet    = body.wallet_balance,
        menu      = body.menu_context or "",
        last_order= body.last_order or "",
    )

    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    
    # Anthropic strictly requires messages to start with a 'user' role
    while messages and messages[0]["role"] != "user":
        messages.pop(0)

    # Anthropic also requires strictly alternating roles
    valid_messages = []
    for m in messages:
        if not valid_messages:
            valid_messages.append(m)
        elif m["role"] != valid_messages[-1]["role"]:
            valid_messages.append(m)
        else:
            valid_messages[-1]["content"] += "\n" + m["content"]
            
    messages = valid_messages
        
    if not messages:
        return {
            "message": "Hi there! How can I help you today?",
            "intent": "chat",
            "order": None,
            "requires_confirmation": False,
            "confirmation_message": None
        }

    # Groq uses standard OpenAI format (system, user, assistant)
    groq_messages = [{"role": "system", "content": system}]
    groq_messages.extend(messages)

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json"
            },
            json={
                "model": "llama-3.1-8b-instant",
                "messages": groq_messages,
                "response_format": {"type": "json_object"}
            },
        )

    if resp.status_code != 200:
        # Fallback for out of credits / API errors
        return {
            "message": f"API Error: {resp.status_code} - {resp.text}",
            "intent": "chat",
            "order": None,
            "requires_confirmation": False,
            "confirmation_message": None
        }

    raw = resp.json()
    text = raw["choices"][0]["message"]["content"]

    # Parse JSON response from Claude
    try:
        # Claude may wrap in ```json ... ``` fences
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        result = json.loads(cleaned.strip())
    except Exception:
        # Fallback: return as plain chat message
        result = {
            "message": text,
            "intent":  "chat",
            "order":   None,
            "requires_confirmation": False,
            "confirmation_message":  None,
        }

    return result