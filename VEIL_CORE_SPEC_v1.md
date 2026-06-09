# VEIL CORE Protocol Specification
**Version:** 1.0.0  
**Status:** Foundational  
**Author:** Swan Labs  
**Date:** 2025  

---

## Abstract

VEIL CORE defines the open protocol for Ambient Web Entities (AWEs) — a new category of persistent digital presence originated by Swan Labs. An AWE is not a page, application, or experience. It is a persistent entity with memory, behavioral morphology, clock-driven evolution, and verifiable relationship continuity.

This specification defines three interdependent layers:

- **VEIL ID** — identity without platforms
- **VEIL STATE** — the entity schema
- **VEIL SYNC** — the runtime protocol

Any rendering surface, infrastructure provider, or developer that implements these three layers is VEIL CORE compliant. The rendering layer is explicitly outside this specification — it is a consumer of it.

---

## 1. Definitions

**Ambient Web Entity (AWE)** — A persistent digital entity with server-side state, a behavioral clock, visitor memory, and phase progression. Exists between visits.

**Entity** — A single AWE instance with a unique UUID, persistent state, and a behavioral clock.

**Visitor** — A human interacting with an entity. Identified by VEIL ID, not by account or cookie.

**Relationship** — The bidirectional record between a Visitor and an Entity. Stored server-side, cryptographically verifiable.

**Phase** — A discrete state in the entity's relationship progression with a specific visitor. Earned over time; cannot be forced.

**Behavioral Axis** — A floating-point value (0.0–1.0) representing a dimension of the entity's state. Drives morphology and rendering.

**Morphology** — The set of visual, behavioral, and tonal properties derived from the entity's axes at a given moment.

**Clock Age** — The elapsed time in minutes since an entity was first instantiated. Increases continuously regardless of visitor presence.

---

## 2. VEIL ID — Identity Primitive

### 2.1 Philosophy

VEIL ID does not require accounts, cookies, OAuth, or any platform's permission. Identity is established through behavioral pattern recognition and cryptographic proof of relationship history.

### 2.2 Identity Components

```typescript
interface VEILIdentity {
  vid: string;              // VEIL ID — derived, not assigned
  fingerprint: string;      // Behavioral pattern hash
  proof: string;            // Ed25519 signature of relationship history
  created_at: number;       // Unix timestamp of first contact
  last_seen: number;        // Unix timestamp of most recent contact
}
```

### 2.3 VID Derivation

A VEIL ID is derived — never assigned. It is computed from a behavioral fingerprint using a one-way hash. The same behavioral pattern always produces the same VID. No server stores the raw fingerprint.

```
fingerprint_inputs = [
  user_agent_hash,          // Hashed, never raw
  timezone_offset,
  screen_resolution_bucket, // Bucketed to reduce uniqueness risk
  language_preference,
  interaction_cadence,      // Typing rhythm, dwell distribution
  canvas_fingerprint_hash   // Hashed
]

vid = base58( sha256( sha256( sorted(fingerprint_inputs).join("|") ) ) )
```

VIDs are deterministic across devices with matching fingerprint inputs. They are not personally identifiable — they cannot be reversed to recover the inputs.

### 2.4 Relationship Proof

When a visitor establishes a relationship with an entity, a signed proof is created:

```typescript
interface RelationshipProof {
  entity_id: string;        // Entity UUID
  vid: string;              // Visitor VID
  first_contact: number;    // Unix timestamp
  visit_count: number;      // Total visits at time of signing
  trust_at_signing: number; // Trust axis value at signing
  signature: string;        // Ed25519 signature
  public_key: string;       // Visitor's ephemeral public key
}
```

Proofs are portable. A visitor can carry their proof to any VEIL CORE compliant runtime and the relationship is recognized.

---

## 3. VEIL STATE — Entity Schema

### 3.1 Entity Object

The canonical entity state object. JSON-serializable. Ed25519-signable. Infrastructure-agnostic.

```typescript
interface VEILEntity {
  // Identity
  id: string;               // UUID v4 — immutable
  name: string;             // Human-readable name (e.g. "VEIL")
  version: string;          // Schema version
  created_at: number;       // Unix ms — immutable
  
  // Clock
  clock_age: number;        // Minutes elapsed since creation — always increasing
  last_ticked: number;      // Unix ms of last clock evolution
  tick_interval: number;    // How often the entity evolves (default: 60000ms)
  
  // Behavioral axes — all 0.0 to 1.0
  axes: {
    trust: number;          // Earned through visits and dwell
    density: number;        // How much the entity reveals
    warmth: number;         // Emotional temperature
    tension: number;        // Internal pressure / urgency
    memory_depth: number;   // How far back the entity remembers
    [key: string]: number;  // Extensible — custom axes allowed
  };
  
  // Phase system
  phase: number;            // 0=DORMANT 1=AWARE 2=FAMILIAR 3=KNOWN 4=FUSED
  phase_history: PhaseTransition[];
  
  // Visitor relationships
  visitor_count: number;
  relationship_count: number;
  
  // State signature
  state_hash: string;       // SHA256 of canonical state (excluding this field)
  signed_at: number;        // Unix ms
  signature: string;        // Ed25519 signature by entity keypair
}
```

### 3.2 Relationship Record

```typescript
interface VEILRelationship {
  id: string;               // UUID v4
  entity_id: string;
  vid: string;              // Visitor VID
  
  // Visit history
  first_contact: number;    // Unix ms
  last_contact: number;     // Unix ms
  visit_count: number;
  total_dwell_seconds: number;
  
  // Relational axes — per-visitor override of entity axes
  axes: {
    trust: number;
    warmth: number;
    density: number;
    tension: number;
    [key: string]: number;
  };
  
  // Phase
  phase: number;
  phase_transitions: PhaseTransition[];
  
  // Event ledger — append only
  events: RelationshipEvent[];
  
  // Proof
  proof: RelationshipProof;
}

interface RelationshipEvent {
  type: "visit" | "dwell" | "interaction" | "phase_transition" | "custom";
  timestamp: number;
  data: Record<string, unknown>;
}

interface PhaseTransition {
  from: number;
  to: number;
  timestamp: number;
  trigger: string;
}
```

### 3.3 Morphology Derivation

Morphology is not stored — it is computed from axes at render time. This keeps the spec renderer-agnostic.

```typescript
interface VEILMorphology {
  // Derived from axes — all 0.0 to 1.0
  visual_density: number;   // How complex the rendered field is
  color_temperature: number; // Warm (1.0) to cool (0.0)
  motion_speed: number;     // How fast the entity moves
  presence_radius: number;  // How large the entity's field is
  revelation: number;       // How much of itself the entity shows
  
  // Phase-gated properties
  phase_label: string;      // Human-readable phase name
  can_initiate: boolean;    // Can entity push to visitor? (phase >= 2)
  can_fuse: boolean;        // Is fusion available? (phase >= 4)
}

function deriveMorphology(entity: VEILEntity, relationship: VEILRelationship): VEILMorphology {
  const axes = relationship.axes; // Relationship axes take precedence
  return {
    visual_density: axes.density,
    color_temperature: axes.warmth,
    motion_speed: axes.tension * 0.4 + axes.trust * 0.2 + 0.1,
    presence_radius: axes.trust * 0.5 + axes.density * 0.3 + 0.1,
    revelation: axes.trust * 0.6 + axes.memory_depth * 0.4,
    phase_label: ["DORMANT","AWARE","FAMILIAR","KNOWN","FUSED"][relationship.phase],
    can_initiate: relationship.phase >= 2,
    can_fuse: relationship.phase >= 4,
  };
}
```

### 3.4 Phase Progression Rules

Phase transitions are rule-based and cannot be forced programmatically:

| Phase | Name | Requirements |
|-------|------|-------------|
| 0 | DORMANT | Default — first contact |
| 1 | AWARE | visits >= 1 |
| 2 | FAMILIAR | visits >= 3 AND trust >= 0.25 |
| 3 | KNOWN | visits >= 5 AND trust >= 0.50 |
| 4 | FUSED | visits >= 8 AND trust >= 0.75 AND total_dwell >= 1800s |

Phase can never decrease. Trust decays at 0.01 per day of absence (max decay: 0.3).

---

## 4. VEIL SYNC — Runtime Protocol

### 4.1 Philosophy

VEIL SYNC is the protocol by which entities evolve, communicate with visitors, and maintain state across any infrastructure. It is transport-agnostic — implementable over HTTP, WebSocket, WebTransport, or custom protocols.

### 4.2 Entity Clock

The entity clock is the heartbeat of the AWE category. It ticks independently of visitor presence.

```typescript
interface ClockTick {
  entity_id: string;
  tick_number: number;
  clock_age_before: number;  // Minutes
  clock_age_after: number;
  timestamp: number;
  
  // What changed this tick
  axis_deltas: Partial<Record<string, number>>;
  phase_transitions: PhaseTransition[];
  events_generated: ClockEvent[];
}

// Default clock evolution rules — overridable per entity
const DEFAULT_TICK_RULES = {
  // Per tick (default: every 60 seconds)
  trust_decay_per_absent_day: -0.01 / 1440,  // Per minute of absence
  warmth_drift_rate: 0.0001,                  // Slow drift toward 0.5
  tension_decay_rate: -0.0005,                // Tension releases over time
  density_growth_rate: 0.00005,               // Slow accumulation
};
```

### 4.3 API Endpoints

All VEIL CORE compliant runtimes MUST implement these endpoints:

```
GET  /v1/entity/:id                    — Fetch entity state
GET  /v1/entity/:id/morphology         — Fetch computed morphology
POST /v1/entity/:id/visit              — Record a visit, return relationship state
POST /v1/entity/:id/dwell              — Record dwell time
POST /v1/entity/:id/interact           — Record an interaction event
GET  /v1/relationship/:entity_id/:vid  — Fetch relationship state
WS   /v1/entity/:id/stream             — Live entity state stream
POST /v1/entity                        — Create a new entity (authenticated)
```

### 4.4 Visit Request / Response

```typescript
// POST /v1/entity/:id/visit
interface VisitRequest {
  vid: string;              // VEIL ID
  proof?: RelationshipProof; // Optional — for returning visitors
  metadata: {
    timestamp: number;
    timezone_offset: number;
    referrer_hash?: string;  // Hashed — never raw URL
  };
}

interface VisitResponse {
  entity: VEILEntity;
  relationship: VEILRelationship;
  morphology: VEILMorphology;
  is_returning: boolean;
  gap_minutes: number;      // Time since last visit
  proof: RelationshipProof; // Updated proof — visitor should store this
}
```

### 4.5 WebSocket Stream Protocol

```typescript
// WS /v1/entity/:id/stream
// Server → Client messages:

interface StreamMessage {
  type: "tick" | "axis_update" | "phase_transition" | "visitor_join" | "visitor_leave";
  entity_id: string;
  timestamp: number;
  payload: ClockTick | AxisUpdate | PhaseTransition | VisitorEvent;
}
```

---

## 5. Compliance Levels

| Level | Name | Requirements |
|-------|------|-------------|
| 1 | VEIL LITE | VEIL STATE schema only. Local storage. No server. |
| 2 | VEIL STANDARD | VEIL STATE + VEIL SYNC. Server-side state. Clock evolution. |
| 3 | VEIL FULL | All three layers. VEIL ID + cryptographic proofs. |
| 4 | VEIL NETWORK | Full compliance + peer entity communication. |

---

## 6. Extensibility

The protocol is intentionally minimal and extensible:

- Custom behavioral axes beyond the core set are permitted
- Custom phase definitions are permitted (must be superset of required phases)
- Custom tick rules are permitted (must not violate decay floors)
- Custom morphology derivations are permitted
- Custom event types in relationship ledgers are permitted

All extensions must be namespaced: `custom.{namespace}.{key}`

---

## 7. What Swan Labs Owns

This specification, the category name "Ambient Web Entity," the abbreviation "AWE," the VEIL entity schema, the VEIL SYNC protocol, and the VEIL ID derivation method are originated by Swan Labs, 2025.

Implementations are open. The standard is Swan Labs'.

---

*VEIL CORE Specification v1.0.0 — Swan Labs — AWE-001*
