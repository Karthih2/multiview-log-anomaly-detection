// Human wording for identifiers the backend returns. The identifiers, their
// order and every number come from the API; only the explanations live here.

export interface StageCopy {
  label: string
  detail: string
}

const STAGES: Record<string, StageCopy> = {
  ingest: { label: 'Read and clean', detail: 'Split each line into fields, drop broken lines, sort by time.' },
  parse: { label: 'Mine templates', detail: 'Drain3 groups lines that share a shape and pulls out their variables.' },
  split: { label: 'Split by time', detail: 'Earlier lines teach the detectors, later lines are held back.' },
  features: { label: 'Build three views', detail: 'Meaning, structure and timing features for every line.' },
  scoring: { label: 'Score each view', detail: 'Prototype distance, Isolation Forest with LOF, HMM with z-score.' },
  fusion: { label: 'Fuse by reliability', detail: 'Each view is weighted by how trustworthy it is for that line.' },
  threshold: { label: 'Threshold and severity', detail: 'A moving cutoff flags anomalies and rates how serious they are.' },
  drift: { label: 'Check for drift', detail: 'Compare later windows with the training period.' },
  evidence: { label: 'Collect evidence', detail: 'Why each of the most severe lines was flagged.' },
  root_cause: { label: 'Group and rank', detail: 'Cluster anomalies into incidents and rank likely origins.' },
  evaluation: { label: 'Evaluate', detail: 'Compare flags with labels, when the log has them.' },
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
    detector: 'Sentence-BERT embedding, distance from clusters of normal messages',
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
  templates_embedded: 'Templates embedded',
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

const METRICS: Record<string, { label: string; meaning: string }> = {
  auc_roc: { label: 'AUC-ROC', meaning: 'How well scores rank real anomalies above normal lines. 0.5 is chance, 1 is perfect.' },
  auc_pr: { label: 'AUC-PR', meaning: 'Ranking quality when anomalies are rare.' },
  precision: { label: 'Precision', meaning: 'Share of flagged lines that are real anomalies.' },
  recall: { label: 'Recall', meaning: 'Share of real anomalies that were flagged.' },
  f1: { label: 'F1', meaning: 'Balance of precision and recall.' },
}

export const metricCopy = (key: string) => METRICS[key] ?? { label: key, meaning: '' }
export const HEADLINE_METRICS = ['auc_roc', 'auc_pr', 'precision', 'recall', 'f1']

const FACTORS: { key: 'first_occurrence_priority_norm' | 'avg_severity_norm' | 'in_cluster_freq_norm' | 'cooc_centrality_norm'; label: string }[] = [
  { key: 'first_occurrence_priority_norm', label: 'Appeared first' },
  { key: 'avg_severity_norm', label: 'Severity' },
  { key: 'in_cluster_freq_norm', label: 'Frequency' },
  { key: 'cooc_centrality_norm', label: 'Co-occurrence' },
]
export const RANKING_FACTORS = FACTORS

const SCOPES: Record<string, string> = {
  test: 'Held-out test period',
  seen_templates: 'Templates seen in training',
  unseen_templates: 'Templates never seen in training',
  'ablation:semantic_only': 'Semantic view alone',
  'ablation:structural_only': 'Structural view alone',
  'ablation:temporal_only': 'Temporal view alone',
  'ablation:semantic_structural': 'Semantic and structural, equal weight',
  'ablation:full': 'All three views, equal weight',
}
export const scopeLabel = (scope: string) => SCOPES[scope] ?? scope
