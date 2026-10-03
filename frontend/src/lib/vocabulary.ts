// Human wording for identifiers the backend returns. The identifiers, their
// order and every number come from the API; only the explanations live here.

export interface StageCopy {
  label: string
  detail: string
}

const STAGES: Record<string, StageCopy> = {
  ingest: { label: 'Read and clean', detail: 'Split each line into fields, drop broken lines, sort by time.' },
  parse: { label: 'Mine templates', detail: 'Drain3 groups lines that share a shape and pulls out their variables.' },
  split: { label: 'Learning window', detail: 'The first part of the log teaches the detectors what normal looks like.' },
  features: { label: 'Build three views', detail: 'Meaning, structure and timing features for every line.' },
  scoring: { label: 'Score each view', detail: 'Prototype distance, Isolation Forest with LOF, HMM with z-score.' },
  fusion: { label: 'Fuse by reliability', detail: 'Each view is weighted by how trustworthy it is for that line.' },
  threshold: { label: 'Threshold and severity', detail: 'A moving cutoff flags anomalies and rates how serious they are.' },
  drift: { label: 'Check for drift', detail: 'Compare later windows with the learning window.' },
  evidence: { label: 'Collect evidence', detail: 'Why each of the most severe lines was flagged.' },
  root_cause: { label: 'Group and rank', detail: 'Cluster anomalies into incidents and rank likely origins.' },
  persist: { label: 'Store results', detail: 'Write everything to the database.' },
  load_artifacts: { label: 'Load saved outputs', detail: 'Read scores the experiment already computed.' },
}

export function stageCopy(stage: string): StageCopy {
  return STAGES[stage] ?? { label: stage.replace(/_/g, ' '), detail: '' }
}

export interface ViewCopy {
  name: string
  reads: string
  detector: string
  catches: string
}

const VIEWS: Record<string, ViewCopy> = {
  semantic: {
    name: 'Semantic',
    reads: 'What the line means',
    detector: "Sentence-BERT embedding of each distinct line's own text, distance from clusters of normal messages",
    catches: 'Messages unlike anything seen in training, even when they share no words with known errors.',
  },
  structural: {
    name: 'Structural',
    reads: 'What shape the line has',
    detector: 'Template, level, component and rarity, scored by Isolation Forest and LOF',
    catches: 'Rare templates and unusual combinations of level, component and parameters.',
  },
  temporal: {
    name: 'Temporal',
    reads: 'When and how often it happens',
    detector: 'Hidden Markov Model over the event sequence, plus a rolling z-score of frequency',
    catches: 'Bursts, repeats and event orders that rarely follow one another.',
  },
}

export function viewCopy(view: string): ViewCopy {
  return VIEWS[view] ?? { name: view, reads: '', detector: '', catches: '' }
}

// Wording for the facts the backend reads off each fitted detector.
const DETECTOR_FACTS: Record<string, string> = {
  distinct_texts_embedded: 'Distinct texts embedded',
  embedding_dimensions: 'Embedding dimensions',
  prototype_model: 'Prototype model',
  prototypes: 'Prototypes of normal messages',
  distance: 'Distance measure',
  global_model: 'Global outlier model',
  trees: 'Trees in the forest',
  local_model: 'Local outlier model',
  neighbours: 'Neighbours compared',
  local_model_fitted_on_rows: 'Lines the local model learned from',
  encoded_features: 'Features after encoding',
  sequence_model: 'Sequence model',
  hidden_states: 'Hidden states',
  distinct_templates_in_training: 'Distinct templates it learned',
  training_iterations: 'Training iterations',
  frequency_signal: 'Frequency signal',
  fitted_on_rows: 'Lines it learned from',
}

export const detectorFactLabel = (key: string) =>
  DETECTOR_FACTS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ')

/** Severity buckets from mild to grave. Anything the backend adds sorts last. */
export const SEVERITY_ORDER = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

export function bySeverity(a: string, b: string): number {
  const rank = (s: string) => (SEVERITY_ORDER.indexOf(s) === -1 ? SEVERITY_ORDER.length : SEVERITY_ORDER.indexOf(s))
  return rank(a) - rank(b)
}

export const severityVar = (severity: string) => `var(--sev-${severity.toLowerCase()}, var(--ink-soft))`
export const viewVar = (view: string) => `var(--view-${view}, var(--ink-soft))`

/** The four ranking factors and their weights in engine/rca/rank_root_cause.py. */
export const RANK_FACTORS = [
  { key: 'first_occurrence_priority_norm', label: 'Appeared first', weight: 0.35 },
  { key: 'avg_severity_norm', label: 'Severity', weight: 0.3 },
  { key: 'in_cluster_freq_norm', label: 'Frequency', weight: 0.2 },
  { key: 'cooc_centrality_norm', label: 'Co-occurrence', weight: 0.15 },
] as const
export type RankFactorKey = (typeof RANK_FACTORS)[number]['key']
