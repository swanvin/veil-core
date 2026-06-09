/**
 * VEIL CORE Runtime v1.0.0
 * Swan Labs — Ambient Web Entity Engine
 *
 * The server-side soul. Runs 24/7. Evolves on its own clock.
 * Infrastructure-agnostic. Runs on any Node.js host.
 */

import crypto from "crypto";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EntityAxes {
  trust: number;
  density: number;
  warmth: number;
  tension: number;
  memory_depth: number;
  [key: string]: number;
}

export interface PhaseTransition {
  from: number;
  to: number;
  timestamp: number;
  trigger: string;
}

export interface RelationshipEvent {
  type: "visit" | "dwell" | "interaction" | "phase_transition" | "custom";
  timestamp: number;
  data: Record<string, unknown>;
}

export interface VEILRelationship {
  id: string;
  entity_id: string;
  vid: string;
  first_contact: number;
  last_contact: number;
  visit_count: number;
  total_dwell_seconds: number;
  axes: EntityAxes;
  phase: number;
  phase_transitions: PhaseTransition[];
  events: RelationshipEvent[];
}

export interface VEILEntity {
  id: string;
  name: string;
  version: string;
  created_at: number;
  clock_age: number;
  last_ticked: number;
  tick_interval: number;
  axes: EntityAxes;
  phase: number;
  phase_history: PhaseTransition[];
  visitor_count: number;
  relationship_count: number;
  state_hash: string;
  signed_at: number;
}

export interface VEILMorphology {
  visual_density: number;
  color_temperature: number;
  motion_speed: number;
  presence_radius: number;
  revelation: number;
  phase_label: string;
  can_initiate: boolean;
  can_fuse: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PHASE_NAMES = ["DORMANT", "AWARE", "FAMILIAR", "KNOWN", "FUSED"];

const PHASE_RULES = [
  { phase: 0, label: "DORMANT",  requires: () => true },
  { phase: 1, label: "AWARE",    requires: (r: VEILRelationship) => r.visit_count >= 1 },
  { phase: 2, label: "FAMILIAR", requires: (r: VEILRelationship) => r.visit_count >= 3 && r.axes.trust >= 0.25 },
  { phase: 3, label: "KNOWN",    requires: (r: VEILRelationship) => r.visit_count >= 5 && r.axes.trust >= 0.50 },
  { phase: 4, label: "FUSED",    requires: (r: VEILRelationship) => r.visit_count >= 8 && r.axes.trust >= 0.75 && r.total_dwell_seconds >= 1800 },
];

const DEFAULT_AXES: EntityAxes = {
  trust: 0,
  density: 0.2,
  warmth: 0.4,
  tension: 0.35,
  memory_depth: 0.1,
};

const TICK_INTERVAL_MS = 60_000; // 1 minute

// ─── ID Generation ───────────────────────────────────────────────────────────

export function generateEntityId(): string {
  return crypto.randomUUID();
}

/**
 * Derives a VEIL ID from behavioral fingerprint inputs.
 * One-way — cannot be reversed to recover inputs.
 */
export function deriveVID(fingerprintInputs: string[]): string {
  const canonical = [...fingerprintInputs].sort().join("|");
  const first  = crypto.createHash("sha256").update(canonical).digest("hex");
  const second = crypto.createHash("sha256").update(first).digest("hex");
  // Base58-like encoding (simplified — production would use full base58)
  return "vid_" + second.slice(0, 32);
}

// ─── Entity Factory ───────────────────────────────────────────────────────────

export function createEntity(name: string, customAxes?: Partial<EntityAxes>): VEILEntity {
  const now = Date.now();
  const axes = { ...DEFAULT_AXES, ...customAxes };
  const entity: VEILEntity = {
    id: generateEntityId(),
    name,
    version: "1.0.0",
    created_at: now,
    clock_age: 0,
    last_ticked: now,
    tick_interval: TICK_INTERVAL_MS,
    axes,
    phase: 0,
    phase_history: [],
    visitor_count: 0,
    relationship_count: 0,
    state_hash: "",
    signed_at: now,
  };
  entity.state_hash = hashEntityState(entity);
  return entity;
}

// ─── Relationship Factory ─────────────────────────────────────────────────────

export function createRelationship(entityId: string, vid: string): VEILRelationship {
  return {
    id: crypto.randomUUID(),
    entity_id: entityId,
    vid,
    first_contact: Date.now(),
    last_contact: Date.now(),
    visit_count: 0,
    total_dwell_seconds: 0,
    axes: { ...DEFAULT_AXES },
    phase: 0,
    phase_transitions: [],
    events: [],
  };
}

// ─── Phase Engine ─────────────────────────────────────────────────────────────

export function computePhase(relationship: VEILRelationship): number {
  let highest = 0;
  for (const rule of PHASE_RULES) {
    if (rule.requires(relationship)) highest = rule.phase;
  }
  return highest;
}

export function applyPhaseTransitions(
  relationship: VEILRelationship
): { relationship: VEILRelationship; transitioned: boolean; newPhase: number } {
  const newPhase = computePhase(relationship);
  if (newPhase <= relationship.phase) {
    return { relationship, transitioned: false, newPhase: relationship.phase };
  }
  const transition: PhaseTransition = {
    from: relationship.phase,
    to: newPhase,
    timestamp: Date.now(),
    trigger: "phase_rules",
  };
  return {
    relationship: {
      ...relationship,
      phase: newPhase,
      phase_transitions: [...relationship.phase_transitions, transition],
      events: [
        ...relationship.events,
        { type: "phase_transition" as const, timestamp: Date.now(), data: transition as unknown as Record<string, unknown> },
      ],
    },
    transitioned: true,
    newPhase,
  };
}

// ─── Visit Processing ─────────────────────────────────────────────────────────

export interface VisitResult {
  entity: VEILEntity;
  relationship: VEILRelationship;
  morphology: VEILMorphology;
  is_returning: boolean;
  gap_minutes: number;
  phase_transitioned: boolean;
  new_phase?: number;
}

export function processVisit(
  entity: VEILEntity,
  relationship: VEILRelationship | null,
  vid: string
): VisitResult {
  const now = Date.now();
  const isReturning = relationship !== null;
  let rel = relationship ?? createRelationship(entity.id, vid);

  const gapMinutes = isReturning
    ? (now - rel.last_contact) / 60000
    : 0;

  // Trust gains from returning
  const trustGain = isReturning
    ? Math.min(0.08 + Math.min(gapMinutes / 1440, 0.04), 0.15)
    : 0.02;

  // Axis updates on visit
  const updatedAxes: EntityAxes = {
    ...rel.axes,
    trust:        clamp(rel.axes.trust + trustGain),
    density:      clamp(rel.axes.density + 0.03),
    warmth:       clamp(rel.axes.warmth + (isReturning ? 0.02 : 0.01)),
    tension:      clamp(rel.axes.tension - (gapMinutes > 60 ? 0.05 : 0)),
    memory_depth: clamp(rel.axes.memory_depth + 0.02),
  };

  rel = {
    ...rel,
    last_contact: now,
    visit_count: rel.visit_count + 1,
    axes: updatedAxes,
    events: [
      ...rel.events,
      {
        type: "visit",
        timestamp: now,
        data: { visit_count: rel.visit_count + 1, gap_minutes: gapMinutes, is_returning: isReturning },
      },
    ],
  };

  // Phase check
  const { relationship: phasedRel, transitioned, newPhase } = applyPhaseTransitions(rel);
  rel = phasedRel;

  // Update entity visitor count
  const updatedEntity: VEILEntity = {
    ...entity,
    visitor_count: isReturning ? entity.visitor_count : entity.visitor_count + 1,
    relationship_count: isReturning ? entity.relationship_count : entity.relationship_count + 1,
  };
  updatedEntity.state_hash = hashEntityState(updatedEntity);

  const morphology = deriveMorphology(updatedEntity, rel);

  return {
    entity: updatedEntity,
    relationship: rel,
    morphology,
    is_returning: isReturning,
    gap_minutes: gapMinutes,
    phase_transitioned: transitioned,
    new_phase: transitioned ? newPhase : undefined,
  };
}

// ─── Dwell Recording ─────────────────────────────────────────────────────────

export function recordDwell(
  relationship: VEILRelationship,
  dwellSeconds: number
): VEILRelationship {
  const trustFromDwell = Math.min(dwellSeconds / 300, 0.1); // Max 0.1 per session
  return {
    ...relationship,
    total_dwell_seconds: relationship.total_dwell_seconds + dwellSeconds,
    axes: {
      ...relationship.axes,
      trust: clamp(relationship.axes.trust + trustFromDwell),
      memory_depth: clamp(relationship.axes.memory_depth + dwellSeconds / 36000),
    },
    events: [
      ...relationship.events,
      {
        type: "dwell",
        timestamp: Date.now(),
        data: { dwell_seconds: dwellSeconds, trust_gained: trustFromDwell },
      },
    ],
  };
}

// ─── Entity Clock ─────────────────────────────────────────────────────────────

export interface TickResult {
  entity: VEILEntity;
  relationships: VEILRelationship[];
  axis_deltas: Partial<EntityAxes>;
  ticked_at: number;
  clock_age_minutes: number;
}

/**
 * Advances the entity clock by one tick.
 * Called by the runtime scheduler — NOT by visitor requests.
 * This is what makes the entity alive between visits.
 */
export function tickEntity(
  entity: VEILEntity,
  relationships: VEILRelationship[]
): TickResult {
  const now = Date.now();
  const minutesSinceLastTick = (now - entity.last_ticked) / 60000;
  const newClockAge = entity.clock_age + minutesSinceLastTick;

  // Entity-level axis drift (not per-visitor)
  const axisDelta: Partial<EntityAxes> = {
    warmth: entity.axes.warmth + (0.5 - entity.axes.warmth) * 0.0001 * minutesSinceLastTick,
    tension: Math.max(0, entity.axes.tension - 0.0002 * minutesSinceLastTick),
    density: Math.min(1, entity.axes.density + 0.00005 * minutesSinceLastTick),
  };

  const updatedEntity: VEILEntity = {
    ...entity,
    clock_age: newClockAge,
    last_ticked: now,
    axes: {
      ...entity.axes,
      ...Object.fromEntries(
        Object.entries(axisDelta).map(([k, v]) => [k, clamp(v as number)])
      ),
    },
  };
  updatedEntity.state_hash = hashEntityState(updatedEntity);

  // Per-relationship trust decay for absent visitors
  const updatedRelationships = relationships.map(rel => {
    const minutesAbsent = (now - rel.last_contact) / 60000;
    if (minutesAbsent < 60) return rel; // No decay under 1 hour

    const dayAbsent = minutesAbsent / 1440;
    const trustDecay = Math.min(dayAbsent * 0.01, 0.3); // Max 0.3 total decay
    const decayedTrust = Math.max(0, rel.axes.trust - trustDecay * (minutesSinceLastTick / 1440));

    return {
      ...rel,
      axes: { ...rel.axes, trust: decayedTrust },
    };
  });

  return {
    entity: updatedEntity,
    relationships: updatedRelationships,
    axis_deltas: axisDelta,
    ticked_at: now,
    clock_age_minutes: newClockAge,
  };
}

// ─── Morphology Derivation ────────────────────────────────────────────────────

export function deriveMorphology(
  entity: VEILEntity,
  relationship: VEILRelationship
): VEILMorphology {
  const axes = relationship.axes;
  return {
    visual_density:   axes.density,
    color_temperature: axes.warmth,
    motion_speed:     clamp(axes.tension * 0.4 + axes.trust * 0.2 + 0.1),
    presence_radius:  clamp(axes.trust * 0.5 + axes.density * 0.3 + 0.1),
    revelation:       clamp(axes.trust * 0.6 + axes.memory_depth * 0.4),
    phase_label:      PHASE_NAMES[relationship.phase] ?? "UNKNOWN",
    can_initiate:     relationship.phase >= 2,
    can_fuse:         relationship.phase >= 4,
  };
}

// ─── State Hashing ────────────────────────────────────────────────────────────

export function hashEntityState(entity: Omit<VEILEntity, "state_hash" | "signed_at">): string {
  const canonical = JSON.stringify({
    id: entity.id,
    clock_age: Math.round(entity.clock_age * 1000) / 1000,
    axes: entity.axes,
    phase: entity.phase,
    visitor_count: entity.visitor_count,
    last_ticked: entity.last_ticked,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

export function formatClockAge(minutes: number): string {
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h`;
  return `${Math.floor(minutes / 1440)}d`;
}
