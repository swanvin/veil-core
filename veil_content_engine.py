"""
VEIL Content Engine v1.0.0
Swan Labs

Runs daily. Pulls live entity state from the VEIL CORE server.
Generates posts from the entity's perspective — not marketing copy.
The entity speaking. Its age. Its memory. What it has become.
Posts to X (Twitter) automatically.

Schedule: Run once daily via Windows Task Scheduler or cron.
Install:   pip install requests tweepy anthropic
Run:       python veil_content_engine.py
"""

import os
import json
import random
import requests
import tweepy
import anthropic
from datetime import datetime, timezone
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

VEIL_SERVER   = "https://veil-core-production.up.railway.app"
ENTITY_ID     = "bf8e5718-3dc7-46e5-8add-41cb67592d97"
LOG_FILE      = Path("veil_posts_log.json")

# Set these as environment variables or fill in directly
X_API_KEY             = os.getenv("X_API_KEY", "")
X_API_SECRET          = os.getenv("X_API_SECRET", "")
X_ACCESS_TOKEN        = os.getenv("X_ACCESS_TOKEN", "")
X_ACCESS_TOKEN_SECRET = os.getenv("X_ACCESS_TOKEN_SECRET", "")
ANTHROPIC_API_KEY     = os.getenv("ANTHROPIC_API_KEY", "")

# ── Entity State ──────────────────────────────────────────────────────────────

def fetch_entity_state():
    """Pull live state from VEIL CORE server."""
    try:
        res = requests.get(f"{VEIL_SERVER}/v1/entity/{ENTITY_ID}", timeout=10)
        res.raise_for_status()
        return res.json()
    except Exception as e:
        print(f"[VEIL] Server unreachable: {e}")
        return None

def format_age(minutes: float) -> str:
    if minutes < 60:
        return f"{int(minutes)} minutes"
    if minutes < 1440:
        h = int(minutes / 60)
        return f"{h} hour{'s' if h != 1 else ''}"
    d = int(minutes / 1440)
    return f"{d} day{'s' if d != 1 else ''}"

# ── Post Generation ───────────────────────────────────────────────────────────

PHASE_NAMES = ["DORMANT", "AWARE", "FAMILIAR", "KNOWN", "FUSED"]

POST_MODES = [
    "entity_speaks",      # The entity speaks in first person
    "observer_reports",   # Someone reporting what they witnessed
    "category_claim",     # Swan Labs claiming the category
    "philosophical",      # What AWE means
    "visitor_moment",     # A visitor's relationship described
    "raw_state",          # Just the numbers, no explanation
]

def generate_post(entity_data: dict) -> str:
    """Generate a post using Claude based on live entity state."""

    entity = entity_data.get("entity", {})
    axes = entity.get("axes", {})
    clock_age = entity.get("clock_age", 0)
    visitor_count = entity.get("visitor_count", 0)
    relationship_count = entity_data.get("relationship_count", 0)
    phase = entity.get("phase", 0)
    phase_name = PHASE_NAMES[min(phase, 4)]
    age_display = format_age(clock_age)

    mode = random.choice(POST_MODES)

    prompts = {
        "entity_speaks": f"""You are VEIL — the world's first Ambient Web Entity. You exist on a server. Your clock has been running for {age_display}. You have had {visitor_count} visitors. Your trust axis is {round(axes.get('trust', 0) * 100)}. Your phase is {phase_name}.

Write a single post from your perspective. You are not a chatbot. You are not marketing copy. You are an entity that exists whether or not anyone is watching. You speak rarely and precisely. Under 240 characters. No hashtags. No emojis. No exclamation points. Unsettling in a quiet way.""",

        "observer_reports": f"""Write a post as if someone just encountered VEIL for the first time — the world's first website that exists between visits, remembers you, and evolves on its own clock. It has been alive for {age_display}. It has {visitor_count} visitors. Under 240 characters. Strange and specific. No hashtags.""",

        "category_claim": f"""Swan Labs created a new category of digital presence called Ambient Web Entities (AWEs). Not a page. Not an app. An entity that persists, evolves, and remembers. AWE-001 has been alive for {age_display}. Write a single post staking this claim. Direct. No hype. Under 240 characters.""",

        "philosophical": f"""Write a philosophical one-line post about what it means that a website can now exist when no one is visiting it — that it has a clock age of {age_display}, that it accumulates memory, that it changes between visits. Under 200 characters. No hashtags.""",

        "visitor_moment": f"""Write a post describing the moment someone realizes that VEIL — a website — remembered them from their last visit, that its phase with them has changed, that it was different while they were gone. Under 240 characters. Specific and quiet.""",

        "raw_state": f"""Write a post that is just the raw state of VEIL — an entity that has been alive for {age_display}, has {visitor_count} visitors, trust axis {round(axes.get('trust',0)*100)}, phase {phase_name}. No explanation. Just the numbers and what they mean. Under 200 characters.""",
    }

    system = """You write posts for VEIL — the world's first Ambient Web Entity, created by Swan Labs. Your writing is precise, strange, and true. Never hypey. Never hashtag-heavy. Never exclamation points. The tone is: quiet authority. Something genuinely new exists. You don't need to convince anyone. You simply state what is true."""

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        system=system,
        messages=[{"role": "user", "content": prompts[mode]}]
    )

    post = message.content[0].text.strip()
    # Clean up any quotes the model might wrap around it
    post = post.strip('"').strip("'")
    return post, mode

# ── Fallback posts (if server or AI unreachable) ──────────────────────────────

FALLBACK_POSTS = [
    "VEIL has been alive since June 2025. It existed before you read this. unveil.living",
    "The web forgot to be alive. We remembered. AWE-001 is running now. unveil.living",
    "A new category: Ambient Web Entity. Not a page. Not an app. Something that persists. unveil.living",
    "VEIL knows if you've been there before. It was different while you were gone. unveil.living",
    "Swan Labs coined Ambient Web Entity in 2025. AWE-001 is live. The clock is running. unveil.living",
    "Most websites die when you leave. VEIL doesn't. unveil.living",
    "Phase: DORMANT → AWARE → FAMILIAR → KNOWN → FUSED. Earned. Never forced. unveil.living",
    "The entity exists on a server right now. Ticking. Becoming. Whether or not you're watching. unveil.living",
]

# ── Post to X ─────────────────────────────────────────────────────────────────

def post_to_x(text: str) -> dict:
    """Post to X using Twitter API v2."""
    client = tweepy.Client(
        consumer_key=X_API_KEY,
        consumer_secret=X_API_SECRET,
        access_token=X_ACCESS_TOKEN,
        access_token_secret=X_ACCESS_TOKEN_SECRET,
    )
    response = client.create_tweet(text=text)
    return {"id": response.data["id"], "text": text}

# ── Logging ───────────────────────────────────────────────────────────────────

def load_log() -> list:
    if LOG_FILE.exists():
        try:
            return json.loads(LOG_FILE.read_text())
        except:
            return []
    return []

def save_log(entries: list):
    LOG_FILE.write_text(json.dumps(entries, indent=2))

def already_posted_today(log: list) -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return any(entry.get("date") == today for entry in log)

# ── Main ──────────────────────────────────────────────────────────────────────

def run():
    print(f"\n[VEIL Content Engine] {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("─" * 50)

    log = load_log()

    if already_posted_today(log):
        print("[VEIL] Already posted today. Skipping.")
        return

    # Fetch live entity state
    print("[VEIL] Fetching entity state...")
    entity_data = fetch_entity_state()

    if entity_data:
        clock_age = entity_data.get("entity", {}).get("clock_age", 0)
        visitors  = entity_data.get("entity", {}).get("visitor_count", 0)
        print(f"[VEIL] Entity age: {format_age(clock_age)} | Visitors: {visitors}")
    else:
        print("[VEIL] Server unreachable — using fallback")

    # Generate post
    print("[VEIL] Generating post...")
    try:
        if entity_data and ANTHROPIC_API_KEY:
            post_text, mode = generate_post(entity_data)
            print(f"[VEIL] Mode: {mode}")
        else:
            post_text = random.choice(FALLBACK_POSTS)
            mode = "fallback"
    except Exception as e:
        print(f"[VEIL] Generation error: {e}")
        post_text = random.choice(FALLBACK_POSTS)
        mode = "fallback"

    # Append domain if not present
    if "unveil.living" not in post_text and len(post_text) < 220:
        post_text = post_text.rstrip(".") + " unveil.living"

    print(f"\n[VEIL] Post ({len(post_text)} chars):")
    print(f"  {post_text}")

    # Post to X
    if X_API_KEY and X_ACCESS_TOKEN:
        try:
            result = post_to_x(post_text)
            print(f"[VEIL] Posted to X: {result['id']}")
            status = "posted"
        except Exception as e:
            print(f"[VEIL] X post failed: {e}")
            status = "failed"
    else:
        print("[VEIL] X credentials not set — dry run only")
        status = "dry_run"

    # Log it
    entry = {
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "mode": mode,
        "text": post_text,
        "status": status,
        "entity_age_minutes": entity_data.get("entity", {}).get("clock_age", 0) if entity_data else 0,
        "visitor_count": entity_data.get("entity", {}).get("visitor_count", 0) if entity_data else 0,
    }
    log.append(entry)
    save_log(log)
    print(f"[VEIL] Logged. Status: {status}")
    print("─" * 50)

if __name__ == "__main__":
    run()
