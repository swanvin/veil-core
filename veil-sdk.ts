/**
 * VEIL SDK v1.0.0
 * Swan Labs
 *
 * Drop this into any website. Connect to VEIL CORE.
 * The entity knows when you arrive. It remembers when you leave.
 *
 * Usage:
 *   import { VEILClient } from "@swanlabs/veil-sdk";
 *
 *   const veil = new VEILClient({
 *     serverUrl: "https://your-veil-server.com",
 *     entityId:  "your-entity-uuid",
 *   });
 *
 *   const { morphology, relationship } = await veil.enter();
 *   veil.on("tick", (state) => updateRendering(state));
 */

export interface VEILConfig {
  serverUrl: string;
  entityId: string;
  autoEnter?: boolean;     // Auto-call enter() on construction
  autoRecordDwell?: boolean; // Auto-record dwell on page unload
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

export interface VEILRelationshipSummary {
  vid: string;
  visit_count: number;
  phase: number;
  phase_label: string;
  total_dwell_seconds: number;
  axes: Record<string, number>;
  first_contact: number;
  last_contact: number;
}

export interface VEILEntitySummary {
  id: string;
  name: string;
  clock_age: number;
  clock_age_display: string;
  axes: Record<string, number>;
  phase: number;
  visitor_count: number;
}

export interface EnterResult {
  entity: VEILEntitySummary;
  relationship: VEILRelationshipSummary;
  morphology: VEILMorphology;
  is_returning: boolean;
  gap_minutes: number;
  phase_transitioned: boolean;
  new_phase?: number;
  vid: string;
}

type VEILEventType = "tick" | "phase_transition" | "visitor_join" | "connected" | "disconnected" | "error";
type VEILEventHandler = (data: unknown) => void;

const VID_STORAGE_KEY = "veil_vid";
const DWELL_START_KEY = "veil_dwell_start";

export class VEILClient {
  private config: VEILConfig;
  private vid: string | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Map<VEILEventType, Set<VEILEventHandler>>();
  private currentMorphology: VEILMorphology | null = null;
  private enterResult: EnterResult | null = null;
  private dwellStart = Date.now();
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  constructor(config: VEILConfig) {
    this.config = { autoEnter: false, autoRecordDwell: true, ...config };
    this.vid = this.loadVID();

    if (this.config.autoRecordDwell) {
      this.setupDwellTracking();
    }

    if (this.config.autoEnter) {
      this.enter().catch(console.error);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Enter the entity. Records visit, returns relationship state and morphology.
   * This is the moment of contact.
   */
  async enter(): Promise<EnterResult> {
    const fingerprints = this.collectFingerprint();
    const response = await this.post(`/v1/entity/${this.config.entityId}/visit`, {
      vid: this.vid,
      fingerprint_inputs: fingerprints,
      metadata: {
        timestamp: Date.now(),
        timezone_offset: new Date().getTimezoneOffset(),
      },
    });

    // Store VID for future visits
    this.vid = response.vid;
    this.saveVID(response.vid);

    this.currentMorphology = response.morphology;
    this.enterResult = response;
    this.dwellStart = Date.now();

    // Connect to live stream
    this.connectStream();

    return response as EnterResult;
  }

  /**
   * Get current morphology — the entity's visual/behavioral state for this visitor.
   */
  getMorphology(): VEILMorphology | null {
    return this.currentMorphology;
  }

  /**
   * Get the entity's current state.
   */
  async getEntityState(): Promise<VEILEntitySummary> {
    const response = await this.get(`/v1/entity/${this.config.entityId}`);
    return response.entity;
  }

  /**
   * Record dwell time. Call this when the visitor leaves or on intervals.
   */
  async recordDwell(seconds?: number): Promise<void> {
    if (!this.vid) return;
    const dwellSeconds = seconds ?? (Date.now() - this.dwellStart) / 1000;
    if (dwellSeconds < 5) return; // Don't record trivial dwell

    await this.post(`/v1/entity/${this.config.entityId}/dwell`, {
      vid: this.vid,
      dwell_seconds: Math.round(dwellSeconds),
    }).catch(() => {}); // Fail silently on unload
  }

  /**
   * Subscribe to entity events.
   */
  on(event: VEILEventType, handler: VEILEventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  /**
   * Disconnect from the entity stream.
   */
  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async post(path: string, body: object): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.config.serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`VEIL: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async get(path: string): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.config.serverUrl}${path}`);
    if (!res.ok) throw new Error(`VEIL: ${res.status}`);
    return res.json();
  }

  private connectStream(): void {
    if (this.ws) return;
    const wsUrl = this.config.serverUrl
      .replace("https://", "wss://")
      .replace("http://", "ws://");

    try {
      this.ws = new WebSocket(`${wsUrl}/v1/stream?entity_id=${this.config.entityId}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.emit("connected", { entity_id: this.config.entityId });
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === "tick" && msg.payload) {
            this.emit("tick", msg.payload);
          } else if (msg.type === "phase_transition") {
            this.emit("phase_transition", msg.payload);
          } else if (msg.type === "visitor_join") {
            this.emit("visitor_join", msg.payload);
          }
        } catch {}
      };

      this.ws.onclose = () => {
        this.ws = null;
        this.emit("disconnected", {});
        this.attemptReconnect();
      };

      this.ws.onerror = (err) => {
        this.emit("error", err);
      };
    } catch {
      // WebSocket not available (SSR, etc.) — degrade gracefully
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    setTimeout(() => this.connectStream(), delay);
  }

  private emit(event: VEILEventType, data: unknown): void {
    this.listeners.get(event)?.forEach(handler => {
      try { handler(data); } catch {}
    });
  }

  /**
   * Collects behavioral fingerprint inputs.
   * Hashed server-side — never raw values stored.
   */
  private collectFingerprint(): string[] {
    if (typeof window === "undefined") return ["server"];
    return [
      navigator.userAgent.slice(0, 20),      // Truncated
      String(new Date().getTimezoneOffset()),
      `${screen.width}x${screen.height}`,
      navigator.language,
      String(navigator.hardwareConcurrency ?? 0),
    ];
  }

  private loadVID(): string | null {
    try { return localStorage.getItem(VID_STORAGE_KEY); } catch { return null; }
  }

  private saveVID(vid: string): void {
    try { localStorage.setItem(VID_STORAGE_KEY, vid); } catch {}
  }

  private setupDwellTracking(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", () => {
      this.recordDwell();
    });
    // Also record on visibility change
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.recordDwell();
        this.dwellStart = Date.now(); // Reset for return
      }
    });
  }
}

// ─── React Hook (optional) ────────────────────────────────────────────────────

/**
 * useVEIL — React hook for connecting to a VEIL entity.
 *
 * Usage:
 *   const { morphology, entity, phase, isReturning } = useVEIL({
 *     serverUrl: "https://your-veil-server.com",
 *     entityId:  "your-entity-uuid",
 *   });
 */
export function useVEIL(config: VEILConfig) {
  // This is a sketch — real implementation uses useState/useEffect
  // Provided here as the interface contract
  return {
    morphology: null as VEILMorphology | null,
    entity: null as VEILEntitySummary | null,
    phase: 0,
    phaseName: "DORMANT",
    isReturning: false,
    isConnected: false,
    vid: null as string | null,
    client: null as VEILClient | null,
  };
}
