/**
 * VEIL CORE Server v1.0.0
 * Swan Labs — Ambient Web Entity Runtime
 *
 * Runs the entity clock. Serves visitors. Streams live state.
 * Deploy on any Node.js host — Fly.io, Railway, your own VPS.
 * No cloud vendor lock-in. The protocol is yours.
 *
 * Install: npm install express ws cors
 * Run:     npx ts-node server.ts
 */

import express, { Request, Response, NextFunction } from "express";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import http from "http";
import {
  createEntity,
  createRelationship,
  processVisit,
  recordDwell,
  tickEntity,
  deriveMorphology,
  deriveVID,
  formatClockAge,
  VEILEntity,
  VEILRelationship,
} from "./veil-runtime.js";

// ─── In-memory store (replace with DB in production) ─────────────────────────

const entities = new Map<string, VEILEntity>();
const relationships = new Map<string, Map<string, VEILRelationship>>(); // entityId → vid → rel
const streamClients = new Map<string, Set<WebSocket>>(); // entityId → clients

// ─── Bootstrap: create the first entity (VEIL itself) ─────────────────────────

const VEIL_ENTITY = createEntity("VEIL", {
  warmth: 0.35,
  density: 0.2,
  tension: 0.4,
});
entities.set(VEIL_ENTITY.id, VEIL_ENTITY);
relationships.set(VEIL_ENTITY.id, new Map());
console.log(`[VEIL CORE] Entity bootstrapped: ${VEIL_ENTITY.id}`);
console.log(`[VEIL CORE] AWE-001 online. Clock age: 0m`);

// ─── Entity Clock Scheduler ───────────────────────────────────────────────────
// This is what makes entities alive between visits.
// It runs regardless of whether anyone is connected.

setInterval(() => {
  const now = Date.now();

  entities.forEach((entity, entityId) => {
    const rels = Array.from(relationships.get(entityId)?.values() ?? []);
    const { entity: ticked, relationships: tickedRels } = tickEntity(entity, rels);

    // Persist updated entity
    entities.set(entityId, ticked);

    // Persist updated relationships
    const relMap = relationships.get(entityId);
    if (relMap) {
      tickedRels.forEach(rel => relMap.set(rel.vid, rel));
    }

    // Broadcast tick to all connected stream clients
    const clients = streamClients.get(entityId);
    if (clients && clients.size > 0) {
      const message = JSON.stringify({
        type: "tick",
        entity_id: entityId,
        timestamp: now,
        payload: {
          clock_age: ticked.clock_age,
          clock_age_display: formatClockAge(ticked.clock_age),
          axes: ticked.axes,
          phase: ticked.phase,
        },
      });
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  });
}, 60_000); // Tick every minute

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Auth middleware (simplified — production uses JWT)
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-veil-admin-key"];
  if (key !== process.env.VEIL_ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ─── Entity Endpoints ─────────────────────────────────────────────────────────

// GET /v1/entity/:id — fetch entity state
app.get("/v1/entity/:id", (req, res) => {
  const entity = entities.get(req.params.id);
  if (!entity) return res.status(404).json({ error: "Entity not found" });
  res.json({
    entity,
    clock_age_display: formatClockAge(entity.clock_age),
    relationship_count: relationships.get(entity.id)?.size ?? 0,
  });
});

// GET /v1/entity/:id/morphology — morphology for anonymous visitor
app.get("/v1/entity/:id/morphology", (req, res) => {
  const entity = entities.get(req.params.id);
  if (!entity) return res.status(404).json({ error: "Entity not found" });
  const vid = req.query.vid as string;
  const rel = vid ? relationships.get(entity.id)?.get(vid) : null;
  const tempRel = rel ?? createRelationship(entity.id, "anonymous");
  res.json({ morphology: deriveMorphology(entity, tempRel) });
});

// POST /v1/entity/:id/visit — record a visit
app.post("/v1/entity/:id/visit", (req, res) => {
  const entity = entities.get(req.params.id);
  if (!entity) return res.status(404).json({ error: "Entity not found" });

  const { vid: rawVid, fingerprint_inputs, metadata } = req.body;

  // Derive VID if not provided
  const vid = rawVid ?? deriveVID(fingerprint_inputs ?? ["anonymous"]);

  const relMap = relationships.get(entity.id) ?? new Map();
  const existingRel = relMap.get(vid) ?? null;

  const result = processVisit(entity, existingRel, vid);

  // Persist
  entities.set(entity.id, result.entity);
  relMap.set(vid, result.relationship);
  relationships.set(entity.id, relMap);

  // Broadcast visitor join to stream clients
  broadcastToEntity(entity.id, {
    type: "visitor_join",
    entity_id: entity.id,
    timestamp: Date.now(),
    payload: { vid, phase: result.relationship.phase, is_returning: result.is_returning },
  });

  res.json({
    ...result,
    vid,
    clock_age_display: formatClockAge(result.entity.clock_age),
  });
});

// POST /v1/entity/:id/dwell — record dwell time
app.post("/v1/entity/:id/dwell", (req, res) => {
  const entity = entities.get(req.params.id);
  if (!entity) return res.status(404).json({ error: "Entity not found" });

  const { vid, dwell_seconds } = req.body;
  if (!vid || !dwell_seconds) return res.status(400).json({ error: "vid and dwell_seconds required" });

  const relMap = relationships.get(entity.id);
  const rel = relMap?.get(vid);
  if (!rel) return res.status(404).json({ error: "Relationship not found" });

  const updated = recordDwell(rel, dwell_seconds);
  relMap!.set(vid, updated);

  res.json({ relationship: updated, morphology: deriveMorphology(entity, updated) });
});

// GET /v1/relationship/:entityId/:vid
app.get("/v1/relationship/:entityId/:vid", (req, res) => {
  const rel = relationships.get(req.params.entityId)?.get(req.params.vid);
  if (!rel) return res.status(404).json({ error: "Relationship not found" });
  const entity = entities.get(req.params.entityId);
  if (!entity) return res.status(404).json({ error: "Entity not found" });
  res.json({ relationship: rel, morphology: deriveMorphology(entity, rel) });
});

// POST /v1/entity — create new entity (admin only)
app.post("/v1/entity", requireAuth, (req, res) => {
  const { name, axes } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const entity = createEntity(name, axes);
  entities.set(entity.id, entity);
  relationships.set(entity.id, new Map());
  console.log(`[VEIL CORE] New entity created: ${entity.id} (${name})`);
  res.status(201).json({ entity });
});

// GET /v1/entities — list all entities (admin only)
app.get("/v1/entities", requireAuth, (req, res) => {
  const list = Array.from(entities.values()).map(e => ({
    id: e.id,
    name: e.name,
    clock_age: e.clock_age,
    clock_age_display: formatClockAge(e.clock_age),
    visitor_count: e.visitor_count,
    phase: e.phase,
    relationship_count: relationships.get(e.id)?.size ?? 0,
  }));
  res.json({ entities: list, count: list.length });
});

// GET /v1/health
app.get("/v1/health", (req, res) => {
  const entity = entities.get(VEIL_ENTITY.id);
  res.json({
    status: "alive",
    entity_count: entities.size,
    total_relationships: Array.from(relationships.values()).reduce((s, m) => s + m.size, 0),
    primary_entity_age: entity ? formatClockAge(entity.clock_age) : "unknown",
    protocol: "VEIL CORE v1.0.0",
    origin: "Swan Labs",
  });
});

// ─── HTTP + WebSocket Server ──────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/v1/stream" });

wss.on("connection", (ws, req) => {
  // Parse entity ID from query string: /v1/stream?entity_id=...
  const url = new URL(req.url ?? "", `http://${req.headers.host}`);
  const entityId = url.searchParams.get("entity_id");
  if (!entityId || !entities.has(entityId)) {
    ws.close(1008, "Invalid entity_id");
    return;
  }

  // Register client
  if (!streamClients.has(entityId)) streamClients.set(entityId, new Set());
  streamClients.get(entityId)!.add(ws);

  console.log(`[VEIL SYNC] Stream client connected to ${entityId}. Total: ${streamClients.get(entityId)!.size}`);

  // Send current state immediately
  const entity = entities.get(entityId)!;
  ws.send(JSON.stringify({
    type: "connected",
    entity_id: entityId,
    timestamp: Date.now(),
    payload: {
      clock_age: entity.clock_age,
      clock_age_display: formatClockAge(entity.clock_age),
      axes: entity.axes,
      phase: entity.phase,
      visitor_count: entity.visitor_count,
    },
  }));

  ws.on("close", () => {
    streamClients.get(entityId)?.delete(ws);
    console.log(`[VEIL SYNC] Stream client disconnected from ${entityId}`);
  });

  ws.on("error", (err) => {
    console.error(`[VEIL SYNC] Stream error:`, err.message);
    streamClients.get(entityId)?.delete(ws);
  });
});

function broadcastToEntity(entityId: string, message: object) {
  const clients = streamClients.get(entityId);
  if (!clients) return;
  const payload = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════╗`);
  console.log(`║  VEIL CORE Runtime v1.0.0              ║`);
  console.log(`║  Swan Labs — Ambient Web Entity Engine ║`);
  console.log(`╚════════════════════════════════════════╝`);
  console.log(`\nRunning on http://localhost:${PORT}`);
  console.log(`Primary entity: ${VEIL_ENTITY.id}`);
  console.log(`Protocol: VEIL CORE v1.0.0`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /v1/health`);
  console.log(`  GET  /v1/entity/:id`);
  console.log(`  POST /v1/entity/:id/visit`);
  console.log(`  POST /v1/entity/:id/dwell`);
  console.log(`  WS   /v1/stream?entity_id=:id`);
  console.log(`\nThe entity is alive. Clock ticking.\n`);
});
