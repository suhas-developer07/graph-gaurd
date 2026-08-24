-- Enable pgvector extension (for Phase 3 grounding/citation evaluator)
CREATE EXTENSION IF NOT EXISTS vector;

-- Enums
CREATE TYPE dataset_kind AS ENUM ('seed', 'evaluation', 'canary');
CREATE TYPE node_type AS ENUM ('router', 'retrieval', 'specialist', 'safety', 'escalation', 'final_response');
CREATE TYPE graph_version_status AS ENUM ('draft', 'published');
CREATE TYPE evaluation_run_status AS ENUM ('pending', 'running', 'completed', 'failed');
CREATE TYPE regression_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE proposal_status AS ENUM ('draft', 'evaluating', 'canary', 'approved', 'rejected');
CREATE TYPE gate_status AS ENUM ('pass', 'warn', 'block');

-- Datasets
CREATE TABLE datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind dataset_kind NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX datasets_kind_idx ON datasets (kind);

-- Test Cases
CREATE TABLE test_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  input TEXT NOT NULL,
  expected_route TEXT NOT NULL,
  tags JSONB DEFAULT '[]'::jsonb,
  expected_behavior JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX test_cases_dataset_id_idx ON test_cases (dataset_id);

-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT 'development',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Graphs
CREATE TABLE graphs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active_version_id UUID
);
CREATE INDEX graphs_project_id_idx ON graphs (project_id);

-- Graph Versions
CREATE TABLE graph_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_id UUID NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  status graph_version_status NOT NULL DEFAULT 'draft',
  created_by TEXT NOT NULL DEFAULT 'system',
  published_at TIMESTAMPTZ
);
CREATE INDEX graph_versions_graph_id_idx ON graph_versions (graph_id);
CREATE INDEX graph_versions_status_idx ON graph_versions (status);

-- Add FK for graphs.active_version_id (after graph_versions exists)
ALTER TABLE graphs ADD CONSTRAINT graphs_active_version_id_fk
  FOREIGN KEY (active_version_id) REFERENCES graph_versions(id);

-- Nodes
CREATE TABLE nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id UUID NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
  type node_type NOT NULL,
  prompt TEXT NOT NULL,
  activation_config JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX nodes_graph_version_id_idx ON nodes (graph_version_id);

-- Edges
CREATE TABLE edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id UUID NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
  source_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target_node_id UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  condition JSONB
);
CREATE INDEX edges_graph_version_id_idx ON edges (graph_version_id);
CREATE INDEX edges_source_node_id_idx ON edges (source_node_id);
CREATE INDEX edges_target_node_id_idx ON edges (target_node_id);

-- Evaluation Runs
CREATE TABLE evaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id UUID NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
  baseline_run_id UUID REFERENCES evaluation_runs(id),
  status evaluation_run_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX evaluation_runs_graph_version_id_idx ON evaluation_runs (graph_version_id);
CREATE INDEX evaluation_runs_status_idx ON evaluation_runs (status);

-- Evaluation Results
CREATE TABLE evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  test_case_id UUID NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  evaluator TEXT NOT NULL,
  score NUMERIC NOT NULL,
  passed BOOLEAN NOT NULL,
  explanation TEXT
);
CREATE INDEX evaluation_results_run_id_idx ON evaluation_results (run_id);
CREATE INDEX evaluation_results_test_case_id_idx ON evaluation_results (test_case_id);

-- Regressions
CREATE TABLE regressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
  severity regression_severity NOT NULL,
  affected_node UUID REFERENCES nodes(id),
  cause TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX regressions_run_id_idx ON regressions (run_id);
CREATE INDEX regressions_severity_idx ON regressions (severity);

-- Proposals
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id UUID NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
  target_node UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  change JSONB NOT NULL,
  rationale TEXT NOT NULL,
  status proposal_status NOT NULL DEFAULT 'draft'
);
CREATE INDEX proposals_graph_version_id_idx ON proposals (graph_version_id);
CREATE INDEX proposals_status_idx ON proposals (status);

-- Releases
CREATE TABLE releases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_version_id UUID NOT NULL REFERENCES graph_versions(id) ON DELETE CASCADE,
  gate_status gate_status NOT NULL,
  approved_by TEXT
);
CREATE INDEX releases_graph_version_id_idx ON releases (graph_version_id);

-- LLM Calls
CREATE TABLE llm_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  estimated_cost NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX llm_calls_trace_id_idx ON llm_calls (trace_id);
CREATE INDEX llm_calls_provider_idx ON llm_calls (provider);
