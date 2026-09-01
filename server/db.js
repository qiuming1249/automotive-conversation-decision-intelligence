import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
export const dataDir = join(rootDir, "data");
export const uploadDir = join(rootDir, "uploads");
mkdirSync(dataDir, { recursive: true });
mkdirSync(uploadDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, "poc.sqlite"));
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    reception_no TEXT NOT NULL,
    store TEXT NOT NULL,
    salesperson TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    start_at TEXT NOT NULL,
    end_at TEXT,
    duration_seconds INTEGER DEFAULT 0,
    segment_type TEXT NOT NULL,
    quality_status TEXT NOT NULL,
    analysis_status TEXT NOT NULL,
    transcript_source TEXT NOT NULL,
    audio_path TEXT,
    asr_status TEXT NOT NULL,
    active_version TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    version TEXT NOT NULL,
    utterance_index INTEGER NOT NULL,
    start_sec INTEGER NOT NULL,
    end_sec INTEGER NOT NULL,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    confidence REAL NOT NULL,
    included INTEGER NOT NULL,
    status TEXT NOT NULL,
    issue_type TEXT,
    original_id TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS analyses (
    session_id TEXT PRIMARY KEY,
    based_on_version TEXT NOT NULL,
    fact_package TEXT NOT NULL,
    diagnoses TEXT NOT NULL,
    strategies TEXT NOT NULL,
    generated_cards TEXT NOT NULL,
    semantic_package TEXT NOT NULL DEFAULT '{}',
    score INTEGER NOT NULL,
    analyzed_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    details TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS config_versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    scope_type TEXT NOT NULL,
    scope_value TEXT NOT NULL,
    parent_id TEXT,
    status TEXT NOT NULL,
    description TEXT NOT NULL,
    snapshot TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    activated_at TEXT
  );
`);

for (const [column, definition] of [
  ["asr_provider", "TEXT"],
  ["asr_task_id", "TEXT"],
  ["asr_error", "TEXT"]
]) {
  const existing = db.prepare("PRAGMA table_info(sessions)").all().some((item) => item.name === column);
  if (!existing) {
    db.exec(`ALTER TABLE sessions ADD COLUMN ${column} ${definition}`);
  }
}

for (const [column, definition] of [
  ["semantic_package", "TEXT NOT NULL DEFAULT '{}'" ]
]) {
  const existing = db.prepare("PRAGMA table_info(analyses)").all().some((item) => item.name === column);
  if (!existing) {
    db.exec(`ALTER TABLE analyses ADD COLUMN ${column} ${definition}`);
  }
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function rowToSession(row) {
  return {
    ...row,
    durationSeconds: row.duration_seconds,
    segmentType: row.segment_type,
    qualityStatus: row.quality_status,
    analysisStatus: row.analysis_status,
    transcriptSource: row.transcript_source,
    audioPath: row.audio_path,
    asrStatus: row.asr_status,
    asrProvider: row.asr_provider,
    asrTaskId: row.asr_task_id,
    asrError: row.asr_error,
    activeVersion: row.active_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToUtterance(row) {
  return {
    id: row.id,
    sessionId: row.session_id,
    version: row.version,
    index: row.utterance_index,
    startSec: row.start_sec,
    endSec: row.end_sec,
    role: row.role,
    text: row.text,
    included: Boolean(row.included),
    status: row.status,
    issueType: row.issue_type,
    originalId: row.original_id
  };
}
