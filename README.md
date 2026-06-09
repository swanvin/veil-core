# VEIL CORE

**Ambient Web Entity Protocol v1.0.0**  
*Swan Labs — Category origin: 2025*

---

VEIL CORE is the open protocol for Ambient Web Entities (AWEs) — a category of persistent digital presence originated by Swan Labs.

An AWE is not a page. Not an application. Not an experience.  
It is an entity. It exists when you are not there. It evolves on a clock. It remembers you.

---

## What this is

The web has always treated you as a session. A request. An anonymous event.

VEIL CORE defines a new primitive: a digital entity with persistent server-side state, a behavioral clock that runs independently of visitor presence, and a relationship model that deepens over time. When you return, you are returning to something that was alive in your absence.

**Three layers. All owned by Swan Labs.**

- **VEIL ID** — Identity without accounts, cookies, or platform permission
- **VEIL STATE** — The entity schema: axes, phases, memory, morphology
- **VEIL SYNC** — The runtime protocol: clock, relationships, streaming

---

## Quick Start

### Run the entity server

```bash
git clone https://github.com/swanlabs/veil-core
cd veil-core
npm install
VEIL_ADMIN_KEY=your-secret npm run dev
```

The entity is now alive. Its clock is ticking.

### Connect from your website

```typescript
import { VEILClient } from "@swanlabs/veil-sdk";

const veil = new VEILClient({
  serverUrl: "https://your-veil-server.com",
  entityId:  "your-entity-uuid",
});

const { morphology, relationship, is_returning } = await veil.enter();

// morphology tells your renderer what the entity looks like right now
console.log(morphology.phase_label);      // "DORMANT" → "AWARE" → "FAMILIAR" → "KNOWN" → "FUSED"
console.log(morphology.visual_density);   // 0.0–1.0 — how complex to render
console.log(morphology.color_temperature); // 0.0 cool → 1.0 warm

// Live stream — entity ticks every minute regardless of who's connected
veil.on("tick", (state) => {
  updateRenderer(state); // Your rendering layer consumes this
});
```

---

## Protocol Overview

### Entity lifecycle

```
Create entity → Clock starts → Visitor arrives → Relationship formed
     ↓                              ↓
Clock ticks every minute    Trust accumulates over visits
     ↓                              ↓
Entity evolves              Phase progresses: 0→1→2→3→4
     ↓                              ↓
Visitor returns        Entity was different while they were gone
```

### Phase system

| Phase | Name | Requirements |
|-------|------|-------------|
| 0 | DORMANT | First contact |
| 1 | AWARE | Visit recorded |
| 2 | FAMILIAR | 3+ visits, trust ≥ 0.25 |
| 3 | KNOWN | 5+ visits, trust ≥ 0.50 |
| 4 | FUSED | 8+ visits, trust ≥ 0.75, 30+ min dwell |

Phase cannot be forced. It is earned.

### Behavioral axes

Every entity and relationship has five core axes (0.0–1.0):

- `trust` — earned through visits and time
- `density` — how much the entity reveals of itself
- `warmth` — emotional temperature
- `tension` — internal pressure
- `memory_depth` — how far back the entity remembers

Axes drive morphology — the rendering layer reads axes and decides what to draw.

---

## API Reference

```
GET  /v1/health                         — Runtime status
GET  /v1/entity/:id                     — Entity state
GET  /v1/entity/:id/morphology          — Computed morphology
POST /v1/entity/:id/visit               — Record visit, get relationship
POST /v1/entity/:id/dwell               — Record dwell time
GET  /v1/relationship/:entityId/:vid    — Relationship state
WS   /v1/stream?entity_id=:id           — Live state stream
POST /v1/entity                         — Create entity (admin)
```

---

## Rendering

VEIL CORE is rendering-agnostic. The protocol outputs morphology. Your renderer reads it.

Swan Labs ships VEIL Immersive — a WebGL/Canvas renderer — separately.  
Third parties can build any renderer that consumes morphology.

This is by design. The protocol is the asset. The renderer is replaceable.

---

## Infrastructure

Deploy on anything that runs Node.js:

- Fly.io
- Railway
- Render
- Your own VPS
- Any containerized host

No cloud vendor lock-in. No platform dependency. The entity is yours.

---

## The category

**Ambient Web Entity (AWE)** — coined by Swan Labs, 2025.

Swan Labs does not own the infrastructure. Swan Labs owns the standard.

---

*VEIL CORE v1.0.0 — Swan Labs — AWE-001*
