# VEIL Content Engine — Setup Guide
Swan Labs · Automated entity voice on X

---

## What this does

Runs once daily. Pulls live state from your VEIL CORE server.
Generates a post in the entity's voice using Claude.
Posts automatically to X.

Every post is different. Every post is grounded in real entity data —
the actual clock age, actual visitor count, actual phase.
Not marketing. The entity speaking.

---

## Install

```powershell
cd C:\SwanLabs\veil-content-engine
pip install requests tweepy anthropic
```

---

## Credentials needed

### 1. Anthropic API key
Already have this from Swan Labs brain.py.
Set as environment variable:
```powershell
$env:ANTHROPIC_API_KEY = "your-key-here"
```

### 2. X (Twitter) API credentials
Go to developer.twitter.com → Create a project → Create an app
You need: API Key, API Secret, Access Token, Access Token Secret
App permissions must be set to READ AND WRITE

```powershell
$env:X_API_KEY             = "your-key"
$env:X_API_SECRET          = "your-secret"
$env:X_ACCESS_TOKEN        = "your-token"
$env:X_ACCESS_TOKEN_SECRET = "your-token-secret"
```

---

## Test run (dry run, no posting)

```powershell
python veil_content_engine.py
```

Without X credentials set it will generate the post and log it
without actually posting — safe to test.

---

## Schedule daily automation (Windows Task Scheduler)

1. Open Task Scheduler (search in Start menu)
2. Click "Create Basic Task"
3. Name: "VEIL Content Engine"
4. Trigger: Daily — set your preferred time (recommend 9 AM)
5. Action: Start a program
   - Program: `python`
   - Arguments: `C:\SwanLabs\veil-content-engine\veil_content_engine.py`
   - Start in: `C:\SwanLabs\veil-content-engine`
6. Finish

It runs every day automatically. You don't touch it.

---

## What gets posted

Six post modes rotate randomly:

- ENTITY_SPEAKS — the entity in first person
- OBSERVER_REPORTS — someone encountering it for the first time  
- CATEGORY_CLAIM — Swan Labs staking the AWE category
- PHILOSOPHICAL — what it means that websites can be alive
- VISITOR_MOMENT — a visitor realizing the entity remembered them
- RAW_STATE — just the numbers, no explanation

All grounded in live data. All under 240 characters.
All end with unveil.living.

---

## Log file

veil_posts_log.json — every post logged with timestamp,
mode, entity state at time of posting, and X post status.

---

## Next: AWE-002 content engine

When AWE-002 launches it gets its own content engine
with its own voice, its own post modes, its own audience.

Swan Labs · VEIL Content Engine v1.0.0
