export type MessageType = "SHR" | "DEP" | "ARR" | "UNKNOWN";

/** Geographic point in decimal degrees. */
export interface GeoPoint {
  /** latitude in decimal degrees */
  lat: number;
  /** longitude in decimal degrees */
  lon: number;
  /** original token/source that produced this coordinate (for traceability) */
  src?: string;
  /** optional parser-estimated precision of the coordinate representation */
  precision?: "dms" | "dm" | "dd"; // degrees‑minutes‑seconds | degrees‑minutes | decimal degrees
}

/** Free-flight zone (circle) description if present in the message. */
export interface Zone {
  center?: GeoPoint;
  /** radius in kilometers */
  radius_km?: number;
  /** raw tag that defined the zone, e.g. "ZONA" */
  source?: string;
}

export interface Operator {
  name?: string;
  /** normalized phones without spaces, may include leading + */
  phones?: string[];
}

export interface SourceRef {
  message_type: MessageType;
  /** up to ~200 chars of the original message */
  snippet: string;
}

/**
 * Unified flight object used across the parser pipeline before persistence.
 * It intentionally tracks only normalized, semantic fields; transport-level
 * details (like WKB points) are derived at persistence stage.
 */
export interface FlightUnified {
  /** Source identifiers */
  id?: string;            // optional transient id if already present upstream
  batch_id?: string;      // ingestion batch id if available

  /** Scheduling */
  sid?: string;           // system flight id if present in a message
  dof?: string;           // YYYY-MM-DD
  dep_time_utc?: string;  // HH:MM
  arr_time_utc?: string;  // HH:MM
  duration_min?: number;  // derived if both times are present

  /** Geography */
  dep?: GeoPoint;         // departure point (decimal degrees)
  arr?: GeoPoint;         // arrival point (decimal degrees)
  dep_region_id?: number; // resolved region id, if known at enrichment stage
  arr_region_id?: number; // resolved region id, if known at enrichment stage
  zone?: Zone;            // optional circular zone

  /** Airframe / operation */
  reg?: string[];         // one or multiple regs extracted from REG/
  uav_type?: string;      // keep relaxed; source uses BLA/2BLA/etc
  status?: string;        // keep relaxed (e.g., SAR/STATE/FFR)
  operator?: Operator;    // operator/display name + phones
  remarks?: string;       // aggregated RMK/

  /** Timezone hint derived from context; default is "UTC" in parser */
  tz_hint?: "UTC" | "LOCAL" | "UNKNOWN" | (string & {});

  /** Deduplication and lineage */
  dedup_key?: string;     // stable dedup key
  source_refs?: SourceRef[]; // lightweight provenance entries

  /** Escape hatch for rare fields we may want to preserve without typing now */
  extra?: Record<string, unknown>;
}