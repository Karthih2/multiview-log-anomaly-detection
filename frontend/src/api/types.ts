// Shapes returned by the backend (see backend/app/schemas).

export type RunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface Run {
  id: number
  name: string
  source_kind: string
  status: RunStatus
  stage: string | null
  error: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
  raw_rows: number | null
  total_rows: number | null
  n_templates: number | null
  n_anomalies: number | null
  n_incidents: number | null
  train_end_idx: number | null
  val_end_idx: number | null
  time_start: string | null
  time_end: string | null
}

export interface StageEntry {
  stage: string
  started_at: string
}

export interface ViewStats {
  mean_score: number | null
  mean_score_flagged: number | null
  mean_weight: number | null
  mean_weight_flagged: number | null
  dominant_flags: number
}

export interface RunDetail extends Run {
  parameters: Record<string, Record<string, unknown>> | null
  planned_stages: string[]
  stage_log: StageEntry[] | null
  view_summary: Record<string, ViewStats> | null
  /** Per view, facts read off the detector fitted on this log. Null for imported results. */
  detectors: Record<string, Record<string, string | number | boolean>> | null
}

export interface RunSummary {
  run_id: number
  total_rows: number
  n_anomalies: number
  anomaly_rate: number
  n_incidents: number
  n_templates: number
  time_start: string
  time_end: string
  severity_counts: Record<string, number>
}

export interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export interface TimelinePoint {
  date: string
  severity: string
  count: number
}

export interface ComponentRisk {
  component: string | null
  anomaly_count: number
  avg_severity_score: number
}

export interface LogEvent {
  row_index: number
  time: string
  node: string | null
  type: string | null
  component: string | null
  level: string | null
  content: string
  template_id: number
  semantic_score: number
  structural_score: number
  temporal_score: number
  semantic_weight: number
  structural_weight: number
  temporal_weight: number
  final_score: number
  threshold: number | null
  is_anomaly: boolean
  severity_score: number
  severity: string
  incident_id: number | null
}

/** Flagged lines sharing a template and component, with the most severe one. */
export interface AnomalyKind {
  lines: number
  event: LogEvent
}

export interface EvidencePackage {
  nearest_normal_example?: { row_index: number; time: string; content: string; similarity: number }[]
  preceding_events?: { time: string; content: string; template_id: number }[]
  dominant_contributing_view?: string
}

export interface EventDetail extends LogEvent {
  template: string | null
  evidence: { row_index: number; dominant_view: string; package: EvidencePackage } | null
}

export interface Template {
  template_id: number
  template: string
  occurrences: number
  train_frequency: number
}

export interface Incident {
  incident_id: number
  n_anomalies: number
  n_distinct_templates: number
  components_involved: string[]
  start_time: string
  end_time: string
  top_root_cause: string | null
  peak_severity: string | null
}

export interface RootCauseCandidate {
  rank: number
  component: string
  root_cause_score: number
  first_occurrence: string
  in_cluster_freq: number
  avg_severity: number
  first_occurrence_priority_norm: number
  avg_severity_norm: number
  in_cluster_freq_norm: number
  cooc_centrality_norm: number
}

export interface IncidentDetail extends Incident {
  template_counts: Record<string, number>
  root_cause_candidates: RootCauseCandidate[]
}

export interface RootCauseCount {
  component: string
  times_ranked_root_cause: number
}

export interface Cooccurrence {
  component_a: string
  component_b: string
  cooccurrence_count: number
}

export interface DriftWindow {
  window_start: number
  window_end: number
  ks_stat: number
  p_value: number
  consecutive_low_p: number
  drift_flagged: boolean
}

export interface DriftSignal {
  signal: string
  first_flagged_row: number | null
  first_flagged_time: string | null
  control_test: Record<string, number>
  windows: DriftWindow[]
}

/** One slice of the log in time order, for the headline score chart. */
export interface ScoreBucket {
  row_start: number
  time: string
  max_score: number
  mean_threshold: number | null
  n_anomalies: number
}

export interface RootCauseCluster {
  component: string
  n_incidents: number
  n_anomalies: number
  avg_root_cause_score: number
  avg_severity: number
  first_time: string
  last_time: string
  co_components: string[]
  incidents: { incident_id: number; start_time: string; n_anomalies: number }[]
}
