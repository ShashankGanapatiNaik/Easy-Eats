# backend/app/routes/ai_order.py
"""
AI Food Ordering Assistant — Easy Eats
────────────────────────────────────────
Architecture:
  1. User message → Groq LLM extracts intent + params (compact prompt, fast)
  2. Backend queries MongoDB directly based on intent (no menu blob in prompt)
  3. Returns structured { intent, message, data } response to frontend

Endpoints:
  POST /ai/chat          → Main conversational endpoint
  GET  /ai/search-stalls → Direct stall search from MongoDB
  GET  /ai/search-items  → Direct item search from MongoDB
  GET  /ai/track-order   → User's latest active order
  POST /ai/recommend     → Smart recommendations based on cart
"""
import json
import httpx
from collections import Counter
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from bson import ObjectId
from datetime import datetime

from app.utils.security import get_current_user
from app.models.user import User
from app.models.stall import Stall
from app.models.menu_item import MenuItem
from app.models.order import Order, OrderStatus
from app.core.config import settings

router = APIRouter(prefix="/ai", tags=["AI"])
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

# Statuses that mean an order is currently active / being processed
ACTIVE_STATUSES = [
    OrderStatus.placed,
    OrderStatus.accepted,
    OrderStatus.preparing,
    OrderStatus.almost_ready,
    OrderStatus.ready,
]


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class ChatBody(BaseModel):
    messages: List[ChatMessage]
    wallet_balance: float = 0.0
    # Kept for backward-compat but no longer used — DB is queried directly
    menu_context:  Optional[str] = None
    last_order:    Optional[str] = None


class RecommendBody(BaseModel):
    stall_id: str
    cart_item_ids: List[str] = []


# ── Compact extraction-only system prompt ─────────────────────────────────────

EXTRACTION_PROMPT = """You are EatsBot, the AI food ordering assistant for Easy Eats — a campus food app.

Your ONLY job: extract the user's intent and key parameters. Return ONLY valid JSON, no markdown.

{
  "intent": "search_stalls|search_items|order|track_order|wallet_query|recommend|confirm|cancel|chat",
  "message": "friendly 1-2 sentence reply",
  "query": "food/keyword to search (string or null)",
  "stall_name": "stall or hotel name if mentioned (string or null)",
  "items": [{"name": "item name", "qty": 1}],
  "topup_amount": null
}

INTENT RULES:
- search_stalls  → user asks about hotels/stalls/restaurants ("show burger hotels", "best coffee shops", "show stalls", "open hotels", "available stalls", "show all hotels")
- search_items   → user asks about specific food ("show burgers", "available pizzas", "veg items", "snacks", "show drinks", "what's on the menu", "show menu")
- order          → user wants to ORDER something ("order 2 burgers", "I want a coffee", "get me 1 coke from Burger Hub")
- track_order    → user asks about order status ("where is my order", "order status", "how long", "my ETA", "pickup code")
- wallet_query   → user asks about wallet/balance ("my balance", "how much wallet", "wallet balance")
- recommend      → user wants suggestions ("what should I order", "recommend", "what's good", "popular items")
- confirm        → user confirms a pending order ("yes", "confirm", "ok", "sure", "proceed", "pay", "book it", "go ahead")
- cancel         → user cancels a pending order ("no", "cancel", "stop", "never mind")
- chat           → greetings, general questions, anything else
- topup_amount   → set to numeric amount if user wants to add money ("add 500", "top up 200", "add money 1000")

QUERY EXTRACTION:
- "show burger hotels"        → intent: search_stalls, query: "burger"
- "hotels selling pizza"      → intent: search_stalls, query: "pizza"
- "best coffee shops"         → intent: search_stalls, query: "coffee"
- "show available stalls"     → intent: search_stalls, query: null
- "show burgers"              → intent: search_items, query: "burger"
- "available pizzas"          → intent: search_items, query: "pizza"
- "show veg items"            → intent: search_items, query: "veg"
- "show Burger Hub menu"      → intent: search_items, stall_name: "Burger Hub", query: null
- "show drinks from Campus Cafe" → intent: search_items, query: "drinks", stall_name: "Campus Cafe"
- "order 2 burgers and 1 coke from Burger Hub" → intent: order, items: [{name:"burger",qty:2},{name:"coke",qty:1}], stall_name: "Burger Hub"

ITEM EXTRACTION for order intent:
- "order one coffee and sandwich" → items: [{name:"coffee",qty:1},{name:"sandwich",qty:1}]
- "get me 2 veg burgers"         → items: [{name:"veg burger",qty:2}]
- Quantity words: one=1, two=2, three=3, a=1, an=1, couple=2

Always keep "message" friendly, helpful, and concise."""


# ── Groq API call ──────────────────────────────────────────────────────────────

async def call_groq(messages: list, system: str) -> dict:
    """Call Groq API and return parsed JSON response."""
    groq_messages = [{"role": "system", "content": system}]

    # Ensure alternating roles (Groq requirement)
    valid: list = []
    for m in messages:
        if not valid:
            valid.append(m)
        elif m["role"] != valid[-1]["role"]:
            valid.append(m)
        else:
            valid[-1]["content"] += "\n" + m["content"]
    groq_messages.extend(valid)

    # Ensure starts with user role after system
    if len(groq_messages) > 1 and groq_messages[1]["role"] != "user":
        groq_messages = [groq_messages[0]] + [m for m in groq_messages[1:] if m["role"] == "user"]

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "model":           "llama-3.1-8b-instant",
                "messages":        groq_messages,
                "response_format": {"type": "json_object"},
                "temperature":     0.2,
                "max_tokens":      512,
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"AI API error {resp.status_code}: {resp.text[:200]}")

    raw = resp.json()["choices"][0]["message"]["content"]
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            parts = cleaned.split("```")
            cleaned = parts[1] if len(parts) > 1 else cleaned
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        return json.loads(cleaned.strip())
    except Exception:
        return {
            "intent": "chat",
            "message": raw[:300],
            "query": None, "stall_name": None,
            "items": [], "topup_amount": None,
        }


# ── MongoDB serialization helpers ─────────────────────────────────────────────

def stall_to_dict(s: Stall) -> dict:
    return {
        "id":                   str(s.id),
        "name":                 s.name,
        "slug":                 s.slug,
        "cuisine_type":         s.cuisine_type,
        "is_open":              s.is_open,
        "avg_rating":           round(s.avg_rating or 0, 1),
        "estimated_pickup_min": s.estimated_pickup_min or 5,
        "hero_image_url":       s.hero_image_url,
        "logo_url":             s.logo_url,
        "location_label":       s.location_label,
        "description":          s.description,
    }


def item_to_dict(item: MenuItem, stall_name: str = "") -> dict:
    return {
        "id":             str(item.id),
        "name":           item.name,
        "price":          item.discounted_price or item.price,
        "original_price": item.price,
        "category":       item.category,
        "is_veg":         item.is_veg,
        "is_available":   item.is_available,
        "is_popular":     item.is_popular,
        "prep_time_min":  item.prep_time_min or 5,
        "image_url":      item.image_url,
        "stall_id":       str(item.stall_id),
        "stall_name":     stall_name,
        "tags":           item.tags or [],
    }


# ── MongoDB query helpers ─────────────────────────────────────────────────────

async def search_stalls_db(query: Optional[str]) -> list:
    """
    Search MongoDB stalls collection.
    Matches against name, cuisine_type, description, and menu_categories.
    Falls back to all stalls if no match.
    """
    all_stalls = await Stall.find().to_list()

    if not query:
        return [stall_to_dict(s) for s in all_stalls]

    q = query.lower().strip()

    # Special keywords that mean "show everything"
    if q in ("all", "any", "stall", "stalls", "hotel", "hotels", "restaurant", "restaurants", "available"):
        return [stall_to_dict(s) for s in all_stalls]

    matched = []
    for s in all_stalls:
        name_m    = q in s.name.lower()
        cuisine_m = q in (s.cuisine_type or "").lower()
        desc_m    = q in (s.description or "").lower()
        cats_m    = q in " ".join(s.menu_categories or []).lower()
        if name_m or cuisine_m or desc_m or cats_m:
            matched.append(s)

    # Fallback: return everything if nothing matched
    return [stall_to_dict(s) for s in (matched or all_stalls)]


async def search_items_db(
    query: Optional[str],
    stall_name: Optional[str],
) -> list:
    """
    Search MongoDB menu_items collection.
    Optionally filtered to a specific stall by name (fuzzy match).
    """
    all_stalls = await Stall.find().to_list()
    stall_name_map = {str(s.id): s.name for s in all_stalls}

    # Resolve stall filter
    stall_id_filter = None
    if stall_name:
        sn_lower = stall_name.lower()
        for s in all_stalls:
            if sn_lower in s.name.lower() or s.name.lower() in sn_lower:
                stall_id_filter = s.id
                break

    # Fetch items
    query_args = [MenuItem.is_deleted == False]
    if stall_id_filter:
        query_args.append(MenuItem.stall_id == stall_id_filter)

    all_items = await MenuItem.find(*query_args).to_list()

    if not query:
        # Return all (up to 20) when no keyword given
        return [item_to_dict(i, stall_name_map.get(str(i.stall_id), "")) for i in all_items[:20]]

    q = query.lower().strip()

    # Veg / Non-veg special cases
    if q in ("veg", "vegetarian", "pure veg"):
        matched = [i for i in all_items if i.is_veg]
    elif q in ("non veg", "non-veg", "nonveg", "chicken", "meat"):
        matched = [i for i in all_items if not i.is_veg]
    else:
        matched = []
        for item in all_items:
            name_m = q in item.name.lower()
            cat_m  = q in (item.category or "").lower()
            tag_m  = any(q in t.lower() for t in (item.tags or []))
            desc_m = q in (item.description or "").lower() if hasattr(item, "description") else False
            if name_m or cat_m or tag_m or desc_m:
                matched.append(item)

    return [item_to_dict(i, stall_name_map.get(str(i.stall_id), "")) for i in matched[:15]]


async def fuzzy_match_order(
    items_requested: list,
    stall_name: Optional[str],
) -> dict:
    """
    Fuzzy-match user-requested items against live MongoDB menu items.
    Returns a complete order summary with real ObjectIds and prices.
    """
    all_stalls = await Stall.find().to_list()
    stall_map = {str(s.id): s for s in all_stalls}

    # Resolve target stall
    target_stall = None
    if stall_name:
        sn = stall_name.lower()
        for s in all_stalls:
            if sn in s.name.lower() or s.name.lower() in sn:
                target_stall = s
                break

    # Fetch candidate items
    base_args = [MenuItem.is_deleted == False, MenuItem.is_available == True]
    if target_stall:
        base_args.append(MenuItem.stall_id == target_stall.id)
    all_menu = await MenuItem.find(*base_args).to_list()

    matched_items = []
    unmatched     = []

    for req in items_requested:
        req_name = str(req.get("name", "")).lower().strip()
        qty      = max(1, int(req.get("qty", 1)))

        best_score = -1
        best_item  = None

        for menu_item in all_menu:
            score = 0
            item_name = menu_item.name.lower()
            item_cat  = (menu_item.category or "").lower()
            item_tags = " ".join(menu_item.tags or []).lower()
            combined  = f"{item_name} {item_cat} {item_tags}"

            if req_name == item_name:                  score = 100
            elif req_name in item_name:                score = 80
            elif item_name in req_name:                score = 70
            else:
                req_words  = req_name.split()
                hit_count  = sum(1 for rw in req_words if rw in combined)
                score = hit_count * 15

            if score > best_score:
                best_score = score
                best_item  = menu_item

        if best_item and best_score > 0:
            stall_obj  = stall_map.get(str(best_item.stall_id))
            sname      = stall_obj.name if stall_obj else ""
            matched_items.append({
                "id":         str(best_item.id),
                "name":       best_item.name,
                "price":      best_item.discounted_price or best_item.price,
                "qty":        qty,
                "stall_id":   str(best_item.stall_id),
                "stall_name": sname,
            })
            # Auto-set target stall from first match
            if not target_stall and stall_obj:
                target_stall = stall_obj
        else:
            unmatched.append(req.get("name", ""))

    if not matched_items:
        return {"error": "no_items_found", "unmatched": unmatched}

    # Force all items from one stall (most common)
    stall_counts  = Counter(i["stall_id"] for i in matched_items)
    primary_sid   = stall_counts.most_common(1)[0][0]
    matched_items = [i for i in matched_items if i["stall_id"] == primary_sid]

    stall_obj = stall_map.get(primary_sid)
    total     = round(sum(i["price"] * i["qty"] for i in matched_items), 2)

    return {
        "stall_id":   primary_sid,
        "stall_name": stall_obj.name if stall_obj else "Unknown Stall",
        "stall_open": stall_obj.is_open if stall_obj else False,
        "items":      matched_items,
        "total":      total,
        "unmatched":  unmatched,
    }


# ── Main chat endpoint ────────────────────────────────────────────────────────

@router.post("/chat")
async def ai_chat(
    body: ChatBody,
    current_user: User = Depends(get_current_user),
):
    """
    Main AI conversational endpoint.
    Step 1: Groq extracts intent + parameters (compact prompt).
    Step 2: Backend queries MongoDB based on intent.
    Step 3: Returns { intent, message, data }.
    """
    messages = [{"role": m.role, "content": m.content} for m in body.messages]

    # Drop leading non-user messages (Groq/OpenAI format requirement)
    while messages and messages[0]["role"] != "user":
        messages.pop(0)

    if not messages:
        return {
            "intent":  "chat",
            "message": "Hi! 👋 I'm EatsBot — your AI food assistant. Ask me to show stalls, find food, or place an order!",
            "data":    None,
        }

    # ── Step 1: Intent extraction via Groq ───────────────────────────────────
    extracted   = await call_groq(messages[-6:], EXTRACTION_PROMPT)
    intent      = extracted.get("intent", "chat")
    message     = extracted.get("message", "How can I help?")
    query       = extracted.get("query")
    stall_name  = extracted.get("stall_name")
    items_req   = extracted.get("items") or []
    topup_amt   = extracted.get("topup_amount")

    # ── Wallet top-up intent ─────────────────────────────────────────────────
    if topup_amt:
        try:
            amount = float(topup_amt)
            if amount > 0:
                return {
                    "intent":  "wallet_topup",
                    "message": message,
                    "data":    {"topup_amount": amount},
                }
        except (ValueError, TypeError):
            pass

    # ── wallet_query ─────────────────────────────────────────────────────────
    if intent == "wallet_query":
        from app.routes.wallet import get_wallet
        wallet = await get_wallet(str(current_user.id))
        return {
            "intent":  "wallet_query",
            "message": f"💰 Your wallet balance is ₹{wallet.balance:.0f}.",
            "data":    {"balance": wallet.balance},
        }

    # ── search_stalls ─────────────────────────────────────────────────────────
    if intent == "search_stalls":
        stalls = await search_stalls_db(query or stall_name)
        return {
            "intent":  "search_stalls",
            "message": message if stalls else "No stalls found right now.",
            "data":    {"stalls": stalls},
        }

    # ── search_items ──────────────────────────────────────────────────────────
    if intent == "search_items":
        items = await search_items_db(query, stall_name)
        if not items:
            return {
                "intent":  "search_items",
                "message": f"Couldn't find any items matching '{query or stall_name}'. Try a different search!",
                "data":    {"items": []},
            }
        return {
            "intent":  "search_items",
            "message": message,
            "data":    {"items": items},
        }

    # ── order ─────────────────────────────────────────────────────────────────
    if intent == "order" and items_req:
        order_data = await fuzzy_match_order(items_req, stall_name)

        if "error" in order_data:
            return {
                "intent":  "chat",
                "message": f"Sorry, I couldn't find those items in our menu. Try 'show items' to browse what's available!",
                "data":    None,
            }

        if not order_data.get("stall_open"):
            return {
                "intent":  "stall_closed",
                "message": f"⚠️ {order_data['stall_name']} is currently closed. Please try another stall!",
                "data":    {"order_summary": order_data},
            }

        # Mention any unmatched items
        unmatched_note = ""
        if order_data.get("unmatched"):
            unmatched_note = f" (couldn't find: {', '.join(order_data['unmatched'])})"

        # Check wallet balance
        from app.routes.wallet import get_wallet
        wallet = await get_wallet(str(current_user.id))
        total  = order_data["total"]

        if wallet.balance < total:
            short = round(total - wallet.balance, 2)
            return {
                "intent":  "low_balance",
                "message": f"❌ Insufficient wallet balance to place this order.{unmatched_note}",
                "data": {
                    "order_summary":  order_data,
                    "wallet_balance": wallet.balance,
                    "required":       total,
                    "shortfall":      short,
                },
            }

        return {
            "intent":  "order_summary",
            "message": (
                f"Here's your order summary{unmatched_note}! "
                f"Wallet: ₹{wallet.balance:.0f} — sufficient ✅. Shall I confirm?"
            ),
            "data": {
                "order_summary":      order_data,
                "wallet_balance":     wallet.balance,
                "requires_confirmation": True,
            },
        }

    # ── track_order ───────────────────────────────────────────────────────────
    if intent == "track_order":
        from beanie.operators import In as BIn
        orders = await Order.find(
            Order.user_id == current_user.id,
            BIn(Order.status, ACTIVE_STATUSES),
        ).sort(-Order.placed_at).limit(1).to_list()

        active_order = orders[0] if orders else None

        if not active_order:
            # Fall back to latest order of any status
            all_orders = await Order.find(
                Order.user_id == current_user.id
            ).sort(-Order.placed_at).limit(1).to_list()

            if not all_orders:
                return {
                    "intent":  "track_order",
                    "message": "You don't have any orders yet! Start by browsing our stalls. 🍽️",
                    "data":    None,
                }

            lo    = all_orders[0]
            stall = await Stall.get(lo.stall_id)
            return {
                "intent":  "track_order",
                "message": f"Your last order from {stall.name if stall else 'the stall'} is {lo.status}.",
                "data": {
                    "order_id":             str(lo.id),
                    "status":               lo.status,
                    "stall_name":           stall.name if stall else "Unknown",
                    "total":                lo.total,
                    "items":                lo.items,
                    "pickup_code":          str(lo.id)[-4:].upper(),
                    "estimated_ready_time": lo.estimated_ready_time,
                    "predicted_prep_min":   lo.predicted_prep_min or 10,
                },
            }

        stall = await Stall.get(active_order.stall_id)
        return {
            "intent":  "track_order",
            "message": f"Your order from {stall.name if stall else 'the stall'} is being processed! 🍳",
            "data": {
                "order_id":             str(active_order.id),
                "status":               active_order.status,
                "stall_name":           stall.name if stall else "Unknown",
                "total":                active_order.total,
                "items":                active_order.items,
                "pickup_code":          str(active_order.id)[-4:].upper(),
                "estimated_ready_time": active_order.estimated_ready_time,
                "predicted_prep_min":   active_order.predicted_prep_min or 10,
            },
        }

    # ── recommend ─────────────────────────────────────────────────────────────
    if intent == "recommend":
        popular = await MenuItem.find(
            MenuItem.is_deleted   == False,
            MenuItem.is_available == True,
            MenuItem.is_popular   == True,
        ).limit(8).to_list()

        all_stalls = await Stall.find().to_list()
        smap       = {str(s.id): s.name for s in all_stalls}
        items_data = [item_to_dict(i, smap.get(str(i.stall_id), "")) for i in popular]

        return {
            "intent":  "recommend",
            "message": message or "Here are some popular picks for you! 🌟",
            "data":    {"items": items_data},
        }

    # ── confirm / cancel ──────────────────────────────────────────────────────
    # These are handled entirely on the frontend (pending order state).
    # If no pending order exists, fall through to generic chat reply.
    if intent in ("confirm", "cancel"):
        return {
            "intent":  "chat",
            "message": message or ("Sure, go ahead!" if intent == "confirm" else "No problem, cancelled!"),
            "data":    None,
        }

    # ── Default chat ──────────────────────────────────────────────────────────
    return {
        "intent":  "chat",
        "message": message or "I'm here to help! Ask me to show stalls, find food, or place an order. 😊",
        "data":    None,
    }


# ── Standalone search endpoints ───────────────────────────────────────────────

@router.get("/search-stalls")
async def search_stalls_endpoint(
    q: Optional[str] = Query(None, description="Search keyword"),
    current_user: User = Depends(get_current_user),
):
    """Direct stall search from MongoDB."""
    stalls = await search_stalls_db(q)
    return {"stalls": stalls, "count": len(stalls)}


@router.get("/search-items")
async def search_items_endpoint(
    q:        Optional[str] = Query(None, description="Search keyword"),
    stall_id: Optional[str] = Query(None, description="Filter by stall ID"),
    current_user: User = Depends(get_current_user),
):
    """Direct item search from MongoDB."""
    stall_name = None
    if stall_id:
        try:
            s = await Stall.get(ObjectId(stall_id))
            stall_name = s.name if s else None
        except Exception:
            pass
    items = await search_items_db(q, stall_name)
    return {"items": items, "count": len(items)}


@router.get("/track-order")
async def track_latest_order(
    current_user: User = Depends(get_current_user),
):
    """Return user's latest active order."""
    from beanie.operators import In as BIn
    orders = await Order.find(
        Order.user_id == current_user.id,
        BIn(Order.status, ACTIVE_STATUSES),
    ).sort(-Order.placed_at).limit(1).to_list()

    if not orders:
        return {"order": None}

    o     = orders[0]
    stall = await Stall.get(o.stall_id)
    return {
        "order": {
            "id":                   str(o.id),
            "status":               o.status,
            "stall_name":           stall.name if stall else "Unknown",
            "total":                o.total,
            "items":                o.items,
            "pickup_code":          str(o.id)[-4:].upper(),
            "estimated_ready_time": o.estimated_ready_time,
            "predicted_prep_min":   o.predicted_prep_min or 10,
        }
    }


@router.post("/recommend")
async def get_chat_recommendations(
    body: RecommendBody,
    current_user: User = Depends(get_current_user),
):
    """
    Smart recommendations for items to add after placing an order.
    Uses affinity rules from menu.py's AFFINITY_MAP.
    """
    from app.routes.menu import AFFINITY_MAP

    try:
        stall_oid = ObjectId(body.stall_id)
    except Exception:
        return []

    cart_ids  = set(body.cart_item_ids)
    all_items = await MenuItem.find(
        MenuItem.stall_id    == stall_oid,
        MenuItem.is_deleted  == False,
        MenuItem.is_available == True,
    ).to_list()

    stall      = await Stall.get(stall_oid)
    stall_name = stall.name if stall else ""
    candidates = [i for i in all_items if str(i.id) not in cart_ids]
    if not candidates:
        return []

    # Cart category context for affinity scoring
    cart_cats: list[str] = []
    for item_id in cart_ids:
        try:
            ci = await MenuItem.get(ObjectId(item_id))
            if ci:
                cart_cats.append(f"{ci.name} {ci.category}".lower())
        except Exception:
            pass

    def affinity_score(item: MenuItem) -> int:
        score     = 0
        item_text = f"{item.name} {item.category}".lower()
        for ctx in cart_cats:
            for kw, affinities in AFFINITY_MAP.items():
                if kw in ctx and any(aff in item_text for aff in affinities):
                    score += 3
        if item.is_popular:
            score += 2
        hour = datetime.now().hour
        if 6 <= hour <= 11 and any(k in item_text for k in ("coffee", "tea", "sandwich")):
            score += 1
        if 16 <= hour <= 20 and any(k in item_text for k in ("snack", "samosa", "chai", "tea")):
            score += 1
        return score

    scored = sorted(candidates, key=affinity_score, reverse=True)
    return [item_to_dict(i, stall_name) for i in scored[:4]]