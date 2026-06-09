/**
 * VEIL SDK v1.0.0
 * Swan Labs
 */

export interface VEILConfig {
  serverUrl: string;
  entityId: string;
  autoEnter?: boolean;
  autoRecordDwell?: boolean;
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

export class VEILClient {
  private config: VEILConfig;
  private vid: string | null = null;
  private ws: WebSocket | null = null;
  private listeners = new Map<VEILEventType, Set<VEILEventHandler>>();
  private currentMorphology: VEILMorphology | null = null;
  private dwellStart = Date.now();
  private reconnectAttempts = 0;
  private maxReconnects = 5;

  constructor(config: VEILConfig) {
    this.config = { autoEnter: false, autoRecordDwell: true, ...config };
    this.vid = this.loadVID();
    if (this.config.autoRecordDwell) this.setupDwellTracking();
    if (this.config.autoEnter) this.enter().catch(console.error);
  }

  async enter(): Promise<EnterResult> {
    const fingerprints = this.collectFingerprint();
    const response = await this.post(`/v1/entity/${this.config.entityId}/visit`, {
      vid: this.vid,
      fingerprint_inputs: fingerprints,
      metadata: { timestamp: Date.now(), timezone_offset: new Date().getTimezoneOffset() },
    }) as EnterResult;

    this.vid = response.vid;
    this.saveVID(response.vid);
    this.currentMorphology = response.morphology;
    this.dwellStart = Date.now();
    this.connectStream();
    return response;
  }

  getMorphology(): VEILMorphology | null { return this.currentMorphology; }

  async getEntityState(): Promise<VEILEntitySummary> {
    const response = await this.get(`/v1/entity/${this.config.entityId}`) as { entity: VEILEntitySummary };
    return response.entity;
  }

  async recordDwell(seconds?: number): Promise<void> {
    if (!this.vid) return;
    const dwellSeconds = seconds ?? (Date.now() - this.dwellStart) / 1000;
    if (dwellSeconds < 5) return;
    await this.post(`/v1/entity/${this.config.entityId}/dwell`, {
      vid: this.vid,
      dwell_seconds: Math.round(dwellSeconds),
    }).catch(() => {});
  }

  on(event: VEILEventType, handler: VEILEventHandler): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => this.listeners.get(event)?.delete(handler);
  }

  disconnect(): void { this.ws?.close(); this.ws = null; }

  private async post(path: string, body: object): Promise<unknown> {
    const res = await fetch(`${this.config.serverUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`VEIL: ${res.status} ${await res.text()}`);
    return res.json();
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.config.serverUrl}${path}`);
    if (!res.ok) throw new Error(`VEIL: ${res.status}`);
    return res.json();
  }

  private connectStream(): void {
    if (this.ws) return;
    const wsUrl = this.config.serverUrl.replace("https://", "wss://").replace("http://", "ws://");
    try {
      this.ws = new WebSocket(`${wsUrl}/v1/stream?entity_id=${this.config.entityId}`);
      this.ws.onopen = () => { this.reconnectAttempts = 0; this.emit("connected", {}); };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          this.emit(msg.type as VEILEventType, msg.payload);
        } catch {}
      };
      this.ws.onclose = () => { this.ws = null; this.emit("disconnected", {}); this.attemptReconnect(); };
      this.ws.onerror = (err) => { this.emit("error", err); };
    } catch {}
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnects) return;
    this.reconnectAttempts++;
    setTimeout(() => this.connectStream(), Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000));
  }

  private emit(event: VEILEventType, data: unknown): void {
    this.listeners.get(event)?.forEach(handler => { try { handler(data); } catch {} });
  }

  private collectFingerprint(): string[] {
    if (typeof window === "undefined") return ["server"];
    return [
      navigator.userAgent.slice(0, 20),
      String(new Date().getTimezoneOffset()),
      `${screen.width}x${screen.height}`,
      navigator.language,
      String(navigator.hardwareConcurrency ?? 0),
    ];
  }

  private loadVID(): string | null { try { return localStorage.getItem(VID_STORAGE_KEY); } catch { return null; } }
  private saveVID(vid: string): void { try { localStorage.setItem(VID_STORAGE_KEY, vid); } catch {} }

  private setupDwellTracking(): void {
    if (typeof window === "undefined") return;
    window.addEventListener("beforeunload", () => { this.recordDwell(); });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") { this.recordDwell(); this.dwellStart = Date.now(); }
    });
  }
}
