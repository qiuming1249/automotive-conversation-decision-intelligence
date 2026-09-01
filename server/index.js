import cors from "cors";
import express from "express";
import multer from "multer";
import { closeSync, createReadStream, existsSync, openSync, readSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { db, newId, nowIso, rowToSession, rowToUtterance, uploadDir } from "./db.js";
import { parseTranscript } from "./transcript.js";
import { getLayerRuleManifest, rebuildAnalysisFromFactEdits, rebuildAnalysisFromFactPackage, runAnalysis } from "./analyzer.js";
import { loadAnalysisConfig, saveAnalysisConfig, saveAnalysisLayer } from "./analysisConfig.js";
import { getUnifiedAsrConfigStatus, pollProviderAsr, saveAsrConfig, startProviderAsr } from "./asr/provider.js";
import { env, setEnvValues } from "./env.js";
import { mapAnonymousSpeakersWithLlm } from "./speakerRoles.js";
import { buildSemanticRuntime } from "./semanticRuntime.js";
import { deliverManagerAlerts } from "./managerAlert.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_, file, cb) => {
    const ext = extname(file.originalname || "");
    cb(null, `${newId("audio")}${ext}`);
  }
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use("/uploads", express.static(uploadDir));

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "sales-qa-insight-poc", storage: "sqlite" });
});

app.get("/api/analysis-rules/manifest", (_, res) => {
  res.json({ layers: getLayerRuleManifest() });
});

app.get("/api/asr/config", (_, res) => {
  res.json(getUnifiedAsrConfigStatus());
});

app.put("/api/asr/config", (req, res) => {
  res.json(saveAsrConfig(req.body || {}));
});

app.get("/api/llm/config", (_, res) => {
  res.json(getLlmConfigStatus());
});

app.put("/api/llm/config", (req, res) => {
  try {
    res.json(saveLlmConfig(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: "invalid_llm_config", message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/manager-wechat/config", (_, res) => {
  res.json(getManagerWechatConfigStatus());
});

app.put("/api/manager-wechat/config", (req, res) => {
  try {
    res.json(saveManagerWechatConfig(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: "invalid_manager_wechat_config", message: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/manager-wechat/test", async (_, res) => {
  const card = {
    title: "三级｜测试预警",
    content: "这是一条店长企业微信通知测试，收到后说明配置有效。",
    evidence: [],
    managerAlert: { required: true, status: "待发送" }
  };
  await deliverManagerAlerts([card], {
    id: `wechat_test_${Date.now()}`,
    reception_no: "配置测试",
    store: "测试门店",
    salesperson: "测试销售",
    customer_name: "测试客户"
  });
  res.json({ ok: card.managerAlert.status === "已推送店长企业微信群", status: card.managerAlert.status });
});

app.get("/api/analysis-config", (_, res) => {
  res.json(loadAnalysisConfig());
});

app.put("/api/analysis-config", (req, res) => {
  try {
    res.json(saveAnalysisConfig(req.body || {}));
  } catch (error) {
    res.status(400).json({ error: "invalid_analysis_config", message: error instanceof Error ? error.message : String(error) });
  }
});

app.put("/api/analysis-config/:layer", (req, res) => {
  try {
    res.json(saveAnalysisLayer(req.params.layer, req.body || {}));
  } catch (error) {
    res.status(400).json({ error: "invalid_analysis_layer", message: error instanceof Error ? error.message : String(error) });
  }
});

app.get("/api/config-versions", (_, res) => {
  ensureConfigBaseline();
  res.json(db.prepare("SELECT * FROM config_versions ORDER BY created_at DESC").all().map(rowToConfigVersion));
});

app.post("/api/config-versions", (req, res) => {
  const body = req.body || {};
  if (!String(body.name || "").trim() || !String(body.scopeValue || "").trim()) {
    return res.status(400).json({ error: "invalid_config_version", message: "请填写版本名称和适用范围。" });
  }
  const id = newId("config");
  db.prepare(`INSERT INTO config_versions
    (id, name, version, scope_type, scope_value, parent_id, status, description, snapshot, created_by, created_at, activated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, String(body.name).trim(), String(body.version || "1.0").trim(), String(body.scopeType || "客户"), String(body.scopeValue).trim(), body.parentId || null, "草稿", String(body.description || ""), JSON.stringify(body.snapshot || loadAnalysisConfig()), String(body.createdBy || "当前用户"), nowIso(), null);
  res.status(201).json(rowToConfigVersion(db.prepare("SELECT * FROM config_versions WHERE id = ?").get(id)));
});

app.post("/api/config-versions/:id/activate", (req, res) => {
  const row = db.prepare("SELECT * FROM config_versions WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "config_version_not_found", message: "配置版本不存在。" });
  const snapshot = JSON.parse(row.snapshot);
  const saved = saveAnalysisConfig(snapshot);
  db.prepare("UPDATE config_versions SET status = '已停用' WHERE scope_type = ? AND scope_value = ? AND status = '已发布'").run(row.scope_type, row.scope_value);
  db.prepare("UPDATE config_versions SET status = '已发布', activated_at = ? WHERE id = ?").run(nowIso(), row.id);
  res.json({ version: rowToConfigVersion(db.prepare("SELECT * FROM config_versions WHERE id = ?").get(row.id)), config: saved });
});

function ensureConfigBaseline() {
  const count = db.prepare("SELECT count(*) AS count FROM config_versions").get().count;
  if (count) return;
  const createdAt = nowIso();
  db.prepare(`INSERT INTO config_versions
    (id, name, version, scope_type, scope_value, parent_id, status, description, snapshot, created_by, created_at, activated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(newId("config"), "当前全局配置", "1.0", "客户", "当前客户", null, "已发布", "由系统当前有效配置生成的基线版本。", JSON.stringify(loadAnalysisConfig()), "系统", createdAt, createdAt);
}

function rowToConfigVersion(row) {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    scopeType: row.scope_type,
    scopeValue: row.scope_value,
    parentId: row.parent_id,
    status: row.status,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at,
    activatedAt: row.activated_at
  };
}

app.get("/api/exports/quality.csv", (req, res) => {
  const rows = buildQualityExportRows(req.query.sessionId ? String(req.query.sessionId) : "");
  sendCsv(res, "质检结果导出.csv", qualityExportHeaders, rows);
});

app.get("/api/exports/insights.csv", (req, res) => {
  const rows = buildInsightExportRows(req.query.sessionId ? String(req.query.sessionId) : "");
  sendCsv(res, "客户洞察结果导出.csv", insightExportHeaders, rows);
});

app.get("/api/exports/facts.csv", (req, res) => {
  const rows = buildFactExportRows(req.query.sessionId ? String(req.query.sessionId) : "");
  sendCsv(res, "事实层抽取结果导出.csv", factExportHeaders, rows);
});

app.get("/api/sessions", (req, res) => {
  const rows = db.prepare("SELECT * FROM sessions ORDER BY created_at DESC").all();
  const sessions = rows.map((row) => ({
    ...rowToSession(row),
    feedbackCount: db.prepare("SELECT count(*) AS count FROM feedback WHERE session_id = ?").get(row.id).count,
    utteranceCount: db.prepare("SELECT count(*) AS count FROM transcripts WHERE session_id = ? AND version = ?").get(row.id, row.active_version).count,
    score: db.prepare("SELECT score FROM analyses WHERE session_id = ?").get(row.id)?.score ?? null
  }));

  const filtered = sessions.filter((item) => {
    if (req.query.status && item.analysisStatus !== req.query.status) return false;
    if (req.query.store && !item.store.includes(String(req.query.store))) return false;
    if (req.query.salesperson && !item.salesperson.includes(String(req.query.salesperson))) return false;
    if (req.query.segmentType && item.segmentType !== req.query.segmentType) return false;
    return true;
  });
  res.json({ sessions: filtered, metrics: buildMetrics() });
});

app.get("/api/sessions/:id", (req, res) => {
  const detail = getSessionDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "session_not_found" });
  res.json(detail);
});

app.get("/api/sessions/:id/audio", (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session?.audio_path) return res.status(404).json({ error: "audio_not_found" });
  const filename = session.audio_path.split("/").pop();
  const filePath = join(uploadDir, filename || "");
  if (!filename || !existsSync(filePath)) return res.status(404).json({ error: "audio_not_found" });

  const size = statSync(filePath).size;
  const contentType = detectAudioMime(filePath);
  const range = req.headers.range;
  if (range) {
    const [startText, endText] = range.replace(/bytes=/, "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : size - 1;
    if (Number.isNaN(start) || Number.isNaN(end) || start >= size) {
      res.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": contentType
    });
    createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    "Content-Length": size,
    "Accept-Ranges": "bytes",
    "Content-Type": contentType
  });
  createReadStream(filePath).pipe(res);
});

app.post("/api/sessions", upload.single("audio"), async (req, res) => {
  const body = req.body || {};
  const transcriptText = body.asrText || body.transcript || "";
  const hasAudio = Boolean(req.file);
  const hasTranscript = transcriptText.trim().length > 0;
  const id = newId("session");
  const createdAt = nowIso();
  const activeVersion = hasTranscript ? "ai_original" : "empty";
  let asrStatus = hasAudio && !hasTranscript ? "待转写/可补充文本" : hasTranscript ? "已提供文本" : "未提供";
  const analysisStatus = hasTranscript ? "待分析" : "待转写";
  const startAt = body.startAt || createdAt;

  db.prepare(`
    INSERT INTO sessions (
      id, reception_no, store, salesperson, customer_name, start_at, end_at, duration_seconds,
      segment_type, quality_status, analysis_status, transcript_source, audio_path, asr_status,
      active_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    body.receptionNo || `RC-${new Date().toISOString().slice(5, 10).replace("-", "")}-${Math.floor(Math.random() * 900 + 100)}`,
    body.store || "深圳宝安大仟里店",
    body.salesperson || "未分配销售",
    body.customerName || "临时客户",
    startAt,
    body.endAt || null,
    Number(body.durationSeconds || 0),
    hasTranscript ? "有效客户接待" : "待确认片段",
    hasTranscript ? "可分析" : "待ASR",
    analysisStatus,
    hasTranscript ? "ASR文本直传" : "录音上传",
    req.file ? `/uploads/${req.file.filename}` : null,
    asrStatus,
    activeVersion,
    createdAt,
    createdAt
  );

  if (hasTranscript) {
    insertTranscriptVersion(id, "ai_original", parseTranscript(transcriptText));
  } else if (hasAudio) {
    try {
      await startAsrTask(id);
    } catch (error) {
      asrStatus = asrStartFailureStatus(error);
      db.prepare("UPDATE sessions SET asr_status = ?, asr_error = ?, updated_at = ? WHERE id = ?").run(
        asrStatus,
        error instanceof Error ? error.message : String(error),
        nowIso(),
        id
      );
    }
  }

  res.status(201).json(getSessionDetail(id));
});

app.post("/api/sessions/:id/asr/start", async (req, res) => {
  try {
    await startAsrTask(req.params.id);
    res.json(getSessionDetail(req.params.id));
  } catch (error) {
    const status = asrStartFailureStatus(error);
    db.prepare("UPDATE sessions SET asr_status = ?, asr_error = ?, updated_at = ? WHERE id = ?").run(
      status,
      error instanceof Error ? error.message : String(error),
      nowIso(),
      req.params.id
    );
    res.status(409).json({ error: "asr_start_failed", message: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/sessions/:id/asr/poll", async (req, res) => {
  try {
    await pollAsrTask(req.params.id);
    res.json(getSessionDetail(req.params.id));
  } catch (error) {
    res.status(409).json({ error: "asr_poll_failed", message: error instanceof Error ? error.message : String(error) });
  }
});

app.patch("/api/sessions/:id/transcript", (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const incoming = Array.isArray(req.body.utterances) ? req.body.utterances : [];
  if (!incoming.length) return res.status(400).json({ error: "utterances_required" });

  const version = `human_${Date.now().toString(36)}`;
  insertTranscriptVersion(
    session.id,
    version,
    incoming.map((item, index) => ({
      ...item,
      startSec: Number(item.startSec ?? index * 18),
      endSec: Number(item.endSec ?? index * 18 + 8),
      role: item.role || "未知",
      text: item.text || "",
      confidence: Number(item.confidence ?? 1),
      included: item.included !== false,
      status: item.status || "人工修正",
      issueType: item.issueType || "",
      originalId: item.id
    }))
  );
  db.prepare("UPDATE sessions SET active_version = ?, analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run(
    version,
    "已修正/待重新分析",
    "人工修正版本",
    nowIso(),
    session.id
  );
  res.json(getSessionDetail(session.id));
});

app.post("/api/sessions/:id/map-speaker-roles", async (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const utterances = getTranscript(session.id, session.active_version);
  try {
    const result = await mapAnonymousSpeakersWithLlm(utterances);
    const roleMap = new Map(result.mapping.map((item) => [item.speaker, item.role]));
    const version = `role_llm_${Date.now().toString(36)}`;
    insertTranscriptVersion(session.id, version, utterances.map((item) => ({
      ...item,
      role: roleMap.get(item.role) || item.role,
      confidence: 1,
      status: roleMap.has(item.role) ? "大模型整通角色标定" : item.status,
      issueType: roleMap.has(item.role) ? "角色待复核" : item.issueType,
      originalId: item.id
    })));
    db.prepare("UPDATE sessions SET active_version = ?, analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run(
      version,
      "角色已标定/待分析",
      "角色待复核",
      nowIso(),
      session.id
    );
    res.json(getSessionDetail(session.id));
  } catch (error) {
    res.status(409).json({ error: "speaker_role_mapping_failed", message: error instanceof Error ? error.message : String(error) });
  }
});

app.post("/api/sessions/:id/analyze", async (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const utterances = getTranscript(session.id, session.active_version);
  if (!utterances.length) {
    return res.status(409).json({
      error: "transcript_required",
      message: "录音已创建任务，但未配置ASR或未补充ASR文本，不能生成分析结果。"
    });
  }
  let result;
  try {
    result = await runAnalysis(session, utterances);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("FACT_MODEL_NOT_CONFIGURED")) {
      db.prepare("UPDATE sessions SET analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run("事实层待配置", "待事实提取", nowIso(), session.id);
      return res.status(409).json({ error: "fact_layer_required", message: message.replace("FACT_MODEL_NOT_CONFIGURED:", "").trim() });
    }
    return res.status(500).json({ error: "analysis_failed", message });
  }
  const analyzedAt = nowIso();
  await deliverManagerAlerts(result.generatedCards, session);
  const semanticPackage = buildSemanticRuntime({
    session,
    utterances,
    result,
    feedback: getFeedbackRows(session.id),
    semanticModel: loadAnalysisConfig().semanticModel
  });
  db.prepare(`
    INSERT INTO analyses (session_id, based_on_version, fact_package, diagnoses, strategies, generated_cards, semantic_package, score, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      based_on_version = excluded.based_on_version,
      fact_package = excluded.fact_package,
      diagnoses = excluded.diagnoses,
      strategies = excluded.strategies,
      generated_cards = excluded.generated_cards,
      semantic_package = excluded.semantic_package,
      score = excluded.score,
      analyzed_at = excluded.analyzed_at
  `).run(
    session.id,
    session.active_version,
    JSON.stringify(result.factPackage),
    JSON.stringify(result.diagnoses),
    JSON.stringify(result.strategies),
    JSON.stringify(result.generatedCards),
    JSON.stringify(semanticPackage),
    result.score,
    analyzedAt
  );
  db.prepare("UPDATE sessions SET analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run("已分析/需复核", "可复核", analyzedAt, session.id);
  res.json(getSessionDetail(session.id));
});

app.post("/api/sessions/:id/rebuild-downstream", async (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const analysisRow = db.prepare("SELECT * FROM analyses WHERE session_id = ?").get(session.id);
  if (!analysisRow) return res.status(409).json({ error: "facts_required", message: "当前接待还没有事实层结果，请先执行一次完整分析。" });
  const existingFactPackage = parseJsonCell(analysisRow.fact_package, {});
  const result = rebuildAnalysisFromFactPackage(existingFactPackage);
  const analyzedAt = nowIso();
  await deliverManagerAlerts(result.generatedCards, session);
  const utterances = getTranscript(session.id, session.active_version);
  const semanticPackage = buildSemanticRuntime({
    session,
    utterances,
    result,
    feedback: getFeedbackRows(session.id),
    semanticModel: loadAnalysisConfig().semanticModel
  });
  db.prepare(`
    UPDATE analyses SET fact_package = ?, diagnoses = ?, strategies = ?, generated_cards = ?, semantic_package = ?, score = ?, analyzed_at = ?
    WHERE session_id = ?
  `).run(
    JSON.stringify(result.factPackage),
    JSON.stringify(result.diagnoses),
    JSON.stringify(result.strategies),
    JSON.stringify(result.generatedCards),
    JSON.stringify(semanticPackage),
    result.score,
    analyzedAt,
    session.id
  );
  db.prepare("UPDATE sessions SET analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run("已按新规则刷新/需复核", "可复核", analyzedAt, session.id);
  res.json(getSessionDetail(session.id));
});

app.patch("/api/sessions/:id/facts", async (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const analysisRow = db.prepare("SELECT * FROM analyses WHERE session_id = ?").get(session.id);
  if (!analysisRow) return res.status(409).json({ error: "facts_required", message: "当前接待还没有事实层结果，请先执行一次完整分析。" });
  const edits = Array.isArray(req.body?.edits) ? req.body.edits : [];
  if (!edits.length) return res.status(400).json({ error: "fact_edits_required", message: "请至少提交一项事实修正。" });

  const existingFactPackage = parseJsonCell(analysisRow.fact_package, {});
  const result = rebuildAnalysisFromFactEdits(existingFactPackage, edits);
  const analyzedAt = nowIso();
  await deliverManagerAlerts(result.generatedCards, session);
  const utterances = getTranscript(session.id, session.active_version);
  const semanticPackage = buildSemanticRuntime({
    session,
    utterances,
    result,
    feedback: getFeedbackRows(session.id),
    semanticModel: loadAnalysisConfig().semanticModel
  });
  db.prepare(`
    UPDATE analyses SET fact_package = ?, diagnoses = ?, strategies = ?, generated_cards = ?, semantic_package = ?, score = ?, analyzed_at = ?
    WHERE session_id = ?
  `).run(
    JSON.stringify(result.factPackage),
    JSON.stringify(result.diagnoses),
    JSON.stringify(result.strategies),
    JSON.stringify(result.generatedCards),
    JSON.stringify(semanticPackage),
    result.score,
    analyzedAt,
    session.id
  );
  db.prepare("UPDATE sessions SET analysis_status = ?, quality_status = ?, updated_at = ? WHERE id = ?").run("事实修正后已联动刷新/需复核", "可复核", analyzedAt, session.id);
  res.json(getSessionDetail(session.id));
});

app.post("/api/sessions/:id/feedback", (req, res) => {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(req.params.id);
  if (!session) return res.status(404).json({ error: "session_not_found" });
  const feedback = {
    id: newId("feedback"),
    actorType: req.body.actorType || "sales",
    action: req.body.action || "采纳",
    target: req.body.target || "generated_card",
    details: req.body.details || "",
    createdAt: nowIso()
  };
  db.prepare("INSERT INTO feedback (id, session_id, actor_type, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    feedback.id,
    session.id,
    feedback.actorType,
    feedback.action,
    feedback.target,
    feedback.details,
    feedback.createdAt
  );
  refreshSemanticRuntime(session.id);
  res.status(201).json(getSessionDetail(session.id));
});

materializeSemanticPackages();

app.listen(port, "127.0.0.1", () => {
  console.log(`API listening on http://127.0.0.1:${port}`);
});

function insertTranscriptVersion(sessionId, version, utterances) {
  const insert = db.prepare(`
    INSERT INTO transcripts (
      id, session_id, version, utterance_index, start_sec, end_sec, role, text, confidence,
      included, status, issue_type, original_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.exec("BEGIN");
  try {
    for (const [index, item] of utterances.entries()) {
      insert.run(
        newId("utt"),
        sessionId,
        version,
        index,
        Number(item.startSec ?? item.start_sec ?? index * 18),
        Number(item.endSec ?? item.end_sec ?? index * 18 + 8),
        item.role || "未知",
        item.text || "",
        Number(item.confidence ?? 0.8),
        item.included === false ? 0 : 1,
        item.status || "AI识别",
        item.issueType || item.issue_type || "",
        item.originalId || item.original_id || null
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getTranscript(sessionId, version) {
  return db
    .prepare("SELECT * FROM transcripts WHERE session_id = ? AND version = ? ORDER BY utterance_index")
    .all(sessionId, version)
    .map(rowToUtterance);
}

function getSessionDetail(id) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id);
  if (!session) return null;
  const transcript = getTranscript(id, session.active_version);
  const originalTranscript = getOriginalTranscript(id);
  const analysisRow = db.prepare("SELECT * FROM analyses WHERE session_id = ?").get(id);
  const feedback = getFeedbackRows(id);
  return {
    session: rowToSession(session),
    transcript,
    originalTranscript,
    analysis: analysisRow
      ? sanitizeAnalysisResult({
          basedOnVersion: analysisRow.based_on_version,
          factPackage: parseJsonCell(analysisRow.fact_package, {}),
          diagnoses: parseJsonCell(analysisRow.diagnoses, []),
          strategies: parseJsonCell(analysisRow.strategies, []),
          generatedCards: parseJsonCell(analysisRow.generated_cards, []),
          semanticPackage: parseJsonCell(analysisRow.semantic_package, {}),
          score: analysisRow.score,
          analyzedAt: analysisRow.analyzed_at
        })
      : null,
    feedback
  };
}

function getFeedbackRows(sessionId) {
  return db
    .prepare("SELECT * FROM feedback WHERE session_id = ? ORDER BY created_at DESC")
    .all(sessionId)
    .map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      actorType: row.actor_type,
      action: row.action,
      target: row.target,
      details: row.details,
      createdAt: row.created_at
    }));
}

function refreshSemanticRuntime(sessionId) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  const analysisRow = db.prepare("SELECT * FROM analyses WHERE session_id = ?").get(sessionId);
  if (!session || !analysisRow) return;
  const result = {
    factPackage: parseJsonCell(analysisRow.fact_package, {}),
    diagnoses: parseJsonCell(analysisRow.diagnoses, []),
    strategies: parseJsonCell(analysisRow.strategies, []),
    generatedCards: parseJsonCell(analysisRow.generated_cards, [])
  };
  const semanticPackage = buildSemanticRuntime({
    session,
    utterances: getTranscript(session.id, session.active_version),
    result,
    feedback: getFeedbackRows(session.id),
    semanticModel: loadAnalysisConfig().semanticModel
  });
  db.prepare("UPDATE analyses SET semantic_package = ? WHERE session_id = ?").run(JSON.stringify(semanticPackage), session.id);
}

function materializeSemanticPackages() {
  const rows = db.prepare("SELECT session_id FROM analyses").all();
  for (const row of rows) {
    try {
      refreshSemanticRuntime(row.session_id);
    } catch (error) {
      console.warn(`语义运行包生成失败 ${row.session_id}:`, error instanceof Error ? error.message : String(error));
    }
  }
}

async function startAsrTask(sessionId) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) throw new Error("接待记录不存在。");
  if (!session.audio_path) throw new Error("该接待没有录音文件。");
  const configStatus = getUnifiedAsrConfigStatus();
  if (!configStatus.configured) {
    throw new Error(`ASR配置不完整：${configStatus.missing.join("、")}`);
  }
  db.prepare("UPDATE sessions SET asr_status = ?, asr_provider = ?, asr_error = ?, updated_at = ? WHERE id = ?").run(
    "转写任务提交中",
    configStatus.activeProvider,
    null,
    nowIso(),
    sessionId
  );
  const submitted = await startProviderAsr(session);
  if (submitted.mode === "sync") {
    if (!submitted.utterances.length) throw new Error("ASR没有返回可用转写文本。");
    const originalExists = transcriptVersionExists(sessionId, "ai_original");
    const version = originalExists ? `asr_${submitted.provider}_${Date.now().toString(36)}` : "ai_original";
    insertTranscriptVersion(sessionId, version, submitted.utterances);
    db.prepare("UPDATE sessions SET active_version = ?, asr_status = ?, asr_provider = ?, analysis_status = ?, quality_status = ?, transcript_source = ?, updated_at = ? WHERE id = ?").run(
      version,
      "转写完成",
      submitted.provider,
      "待分析",
      "可分析",
      submitted.provider === "funasr" ? "FunASR" : "ASR",
      nowIso(),
      sessionId
    );
    return;
  }
  db.prepare("UPDATE sessions SET asr_status = ?, asr_provider = ?, asr_task_id = ?, transcript_source = ?, updated_at = ? WHERE id = ?").run(
    "转写中",
    submitted.provider,
    submitted.taskId,
    submitted.provider === "aliyun" ? "阿里云ASR" : "ASR",
    nowIso(),
    sessionId
  );
}

async function pollAsrTask(sessionId) {
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId);
  if (!session) throw new Error("接待记录不存在。");
  const result = await pollProviderAsr(session);
  if (result.isFailed) {
    db.prepare("UPDATE sessions SET asr_status = ?, asr_error = ?, updated_at = ? WHERE id = ?").run(
      `转写失败：${result.statusText}`,
      JSON.stringify(result.raw),
      nowIso(),
      sessionId
    );
    return;
  }
  if (!result.isComplete) {
    db.prepare("UPDATE sessions SET asr_status = ?, updated_at = ? WHERE id = ?").run(`转写中：${result.statusText}`, nowIso(), sessionId);
    return;
  }
  if (!result.utterances.length) {
    throw new Error("阿里云ASR已完成，但没有返回可用转写文本。");
  }
  const originalExists = transcriptVersionExists(sessionId, "ai_original");
  const version = originalExists ? `asr_${result.provider || "aliyun"}_${Date.now().toString(36)}` : "ai_original";
  insertTranscriptVersion(sessionId, version, result.utterances);
  db.prepare("UPDATE sessions SET active_version = ?, asr_status = ?, analysis_status = ?, quality_status = ?, transcript_source = ?, updated_at = ? WHERE id = ?").run(
    version,
    "转写完成",
    "待分析",
    "可分析",
    result.provider === "aliyun" ? "阿里云ASR" : "ASR",
    nowIso(),
    sessionId
  );
}

function transcriptVersionExists(sessionId, version) {
  return Boolean(db.prepare("SELECT 1 FROM transcripts WHERE session_id = ? AND version = ? LIMIT 1").get(sessionId, version));
}

function getOriginalTranscript(sessionId) {
  const original = getTranscript(sessionId, "ai_original");
  if (original.length) return original;
  const fallback = db
    .prepare("SELECT version FROM transcripts WHERE session_id = ? AND version LIKE 'asr_%' ORDER BY utterance_index LIMIT 1")
    .get(sessionId);
  return fallback?.version ? getTranscript(sessionId, fallback.version) : [];
}

function asrStartFailureStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/USER_BIZDURATION_QUOTA_EXCEED|额度不足|41050001/.test(message)) {
    return `ASR额度不足/可补充文本：${message}`;
  }
  if (/配置不完整|ASR_PROVIDER|ACCESS_KEY|APP_KEY|PUBLIC_BASE_URL|OSS配置/.test(message)) {
    return `待配置：${message}`;
  }
  return `ASR提交失败/可补充文本：${message}`;
}

function detectAudioMime(filePath) {
  const fd = openSync(filePath, "r");
  const buffer = Buffer.alloc(12);
  try {
    readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    closeSync(fd);
  }
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE") {
    return "audio/wav";
  }
  if (buffer.subarray(0, 3).toString("ascii") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
    return "audio/mpeg";
  }
  return "application/octet-stream";
}

function getLlmConfigStatus() {
  const config = loadAnalysisConfig();
  const model = config.factLayer?.model || {};
  const baseUrl = env(model.baseUrlEnv || "LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1");
  const modelName = env(model.modelEnv || "LLM_MODEL", "qwen3.7-max");
  const apiKeySet = Boolean(env(model.apiKeyEnv || "LLM_API_KEY"));
  const missing = [];
  if (!baseUrl) missing.push(model.baseUrlEnv || "LLM_BASE_URL");
  if (!modelName) missing.push(model.modelEnv || "LLM_MODEL");
  if (!apiKeySet) missing.push(model.apiKeyEnv || "LLM_API_KEY");
  return {
    configured: missing.length === 0 && model.enabled !== false && config.factLayer?.enabled !== false,
    missing,
    provider: model.provider || "openai-compatible",
    displayName: model.displayName || "阿里云百炼 Qwen",
    baseUrl,
    modelName,
    apiKeySet,
    temperature: Number(model.temperature ?? 0),
    topP: Number(model.topP ?? 0.8),
    maxCompletionTokens: Number(model.maxCompletionTokens ?? 12000),
    enableThinking: Boolean(model.enableThinking),
    factLayerEnabled: config.factLayer?.enabled !== false,
    modelEnabled: model.enabled !== false
  };
}

function saveLlmConfig(input) {
  const current = getLlmConfigStatus();
  const baseUrl = String(input.baseUrl || current.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1").trim().replace(/\/$/, "");
  const modelName = String(input.modelName || current.modelName || "qwen3.7-max").trim();
  const displayName = String(input.displayName || "阿里云百炼 Qwen3.7-Max").trim();
  const envPatch = {
    LLM_BASE_URL: baseUrl,
    LLM_MODEL: modelName
  };
  setEnvValues(envPatch);

  const config = loadAnalysisConfig();
  const factLayer = config.factLayer || {};
  config.factLayer = {
    ...factLayer,
    enabled: true,
    model: {
      ...(factLayer.model || {}),
      enabled: true,
      provider: "openai-compatible",
      displayName,
      baseUrlEnv: "LLM_BASE_URL",
      apiKeyEnv: "LLM_API_KEY",
      modelEnv: "LLM_MODEL",
      temperature: Number(input.temperature ?? current.temperature ?? 0),
      topP: Number(input.topP ?? current.topP ?? 0.8),
      maxCompletionTokens: Number(input.maxCompletionTokens ?? current.maxCompletionTokens ?? 12000),
      enableThinking: Boolean(input.enableThinking),
      allowLocalExtractor: false
    }
  };
  saveAnalysisConfig(config);
  return getLlmConfigStatus();
}

function splitEnvRecipients(value) {
  return String(value || "").split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function getManagerWechatConfigStatus() {
  const webhook = env("MANAGER_WECHAT_WEBHOOK");
  const userIds = splitEnvRecipients(env("MANAGER_WECHAT_USER_IDS"));
  const mobiles = splitEnvRecipients(env("MANAGER_WECHAT_MOBILES"));
  const missing = [];
  if (!webhook) missing.push("企业微信群机器人地址");
  if (!userIds.length && !mobiles.length) missing.push("店长企业微信用户ID或手机号");
  return {
    configured: missing.length === 0,
    webhookSet: Boolean(webhook),
    webhookHint: webhook ? "已在服务端环境变量中配置" : "未配置",
    userIdsSet: userIds.length > 0,
    mobilesSet: mobiles.length > 0,
    recipientCount: new Set([...userIds, ...mobiles]).size,
    missing
  };
}

function saveManagerWechatConfig(input) {
  const userIds = splitEnvRecipients(input.userIds).join(",");
  const mobiles = splitEnvRecipients(input.mobiles).join(",");
  const values = {};
  if (userIds) values.MANAGER_WECHAT_USER_IDS = userIds;
  if (mobiles) values.MANAGER_WECHAT_MOBILES = mobiles;
  setEnvValues(values);
  return getManagerWechatConfigStatus();
}

const qualityExportHeaders = [
  ["录音ID", "recordingId"],
  ["接待编号", "receptionNo"],
  ["门店", "store"],
  ["销售名称", "salesperson"],
  ["客户名称", "customerName"],
  ["接待开始时间", "startAt"],
  ["时长秒", "durationSeconds"],
  ["片段类型", "segmentType"],
  ["质量状态", "qualityStatus"],
  ["分析状态", "analysisStatus"],
  ["转写来源", "transcriptSource"],
  ["分析转写版本", "basedOnVersion"],
  ["质检分", "score"],
  ["分析时间", "analyzedAt"],
  ["事实层系统提示词", "factSystemPrompt"],
  ["事实层用户提示词", "factUserPrompt"],
  ["问题编码", "ruleId"],
  ["问题名称", "issue"],
  ["问题分类", "category"],
  ["风险等级", "riskLevel"],
  ["命中原因", "reason"],
  ["是否可挽回", "recoverable"],
  ["是否需人工复核", "manualReviewRequired"],
  ["证据时间戳", "evidenceTimestamp"],
  ["证据角色", "evidenceSpeaker"],
  ["证据类型", "evidenceType"],
  ["证据原文", "evidenceQuote"]
];

const insightExportHeaders = [
  ["录音ID", "recordingId"],
  ["接待编号", "receptionNo"],
  ["门店", "store"],
  ["销售名称", "salesperson"],
  ["客户名称", "customerName"],
  ["接待开始时间", "startAt"],
  ["时长秒", "durationSeconds"],
  ["片段类型", "segmentType"],
  ["质量状态", "qualityStatus"],
  ["分析状态", "analysisStatus"],
  ["转写来源", "transcriptSource"],
  ["分析转写版本", "basedOnVersion"],
  ["分析时间", "analyzedAt"],
  ["事实层系统提示词", "factSystemPrompt"],
  ["事实层用户提示词", "factUserPrompt"],
  ["结果类型", "resultType"],
  ["结果分类", "category"],
  ["字段编码", "fieldKey"],
  ["字段名称", "fieldName"],
  ["字段抽取提示词", "fieldPrompt"],
  ["字段值", "fieldValue"],
  ["证据时间戳", "evidenceTimestamp"],
  ["证据角色", "evidenceSpeaker"],
  ["证据类型", "evidenceType"],
  ["证据原文", "evidenceQuote"]
];

const factExportHeaders = [
  ["录音ID", "recordingId"],
  ["接待编号", "receptionNo"],
  ["门店", "store"],
  ["销售名称", "salesperson"],
  ["客户名称", "customerName"],
  ["接待开始时间", "startAt"],
  ["时长秒", "durationSeconds"],
  ["片段类型", "segmentType"],
  ["分析状态", "analysisStatus"],
  ["分析转写版本", "basedOnVersion"],
  ["分析时间", "analyzedAt"],
  ["事实层系统提示词", "factSystemPrompt"],
  ["事实层用户提示词", "factUserPrompt"],
  ["事实分类", "category"],
  ["字段编码", "fieldKey"],
  ["字段名称", "fieldName"],
  ["字段含义", "fieldMeaning"],
  ["字段抽取提示词", "fieldPrompt"],
  ["输出要求", "outputRequirement"],
  ["抽取状态", "extractionStatus"],
  ["抽取值", "fieldValue"],
  ["证据时间戳", "evidenceTimestamp"],
  ["证据角色", "evidenceSpeaker"],
  ["证据类型", "evidenceType"],
  ["证据原文", "evidenceQuote"]
];

function buildQualityExportRows(sessionId = "") {
  return getAnalyzedRows(sessionId).flatMap(({ session, analysis }) => {
    const base = exportBase(session, analysis);
    const diagnoses = Array.isArray(analysis.diagnoses) ? analysis.diagnoses : [];
    return diagnoses.map((diagnosis) => {
      const evidence = firstEvidence(diagnosis.evidence);
      return {
        ...base,
        ruleId: diagnosis.ruleId || "",
        issue: diagnosis.issue || "",
        category: diagnosis.category || "",
        riskLevel: diagnosis.riskLevel || "",
        reason: diagnosis.reason || "",
        recoverable: diagnosis.recoverable === false ? "否" : "是",
        manualReviewRequired: diagnosis.manualReviewRequired ? "是" : "否",
        ...evidenceColumns(evidence)
      };
    });
  });
}

function buildFactExportRows(sessionId = "") {
  return getAnalyzedRows(sessionId).flatMap(({ session, analysis }) => {
    const fact = analysis.factPackage || {};
    const base = exportBase(session, analysis);
    return (Array.isArray(fact.extractedFacts) ? fact.extractedFacts : []).map((item) => {
      const evidence = firstFactEvidence(item);
      return {
        ...base,
        category: item.category || "",
        fieldKey: item.key || "",
        fieldName: item.field || "",
        fieldMeaning: item.meaning || "",
        fieldPrompt: item.modelPrompt || "",
        outputRequirement: formatExportRequirementLabels(item.outputRequirement),
        extractionStatus: evidence ? "已提取" : (item.extractionStatus || "无明确证据"),
        fieldValue: formatFactCellValue(item.value),
        ...evidenceColumns(evidence)
      };
    });
  });
}

function buildInsightExportRows(sessionId = "") {
  return getAnalyzedRows(sessionId).flatMap(({ session, analysis }) => {
    const fact = analysis.factPackage || {};
    const base = exportBase(session, analysis);
    const rows = [];

    addInsightFieldRows(rows, base, "客户画像", "基础画像", {
      使用场景: fact.customerProfile?.useCase,
      预算信息: fact.customerProfile?.budgetValue,
      购买周期: fact.customerProfile?.purchaseTimeline,
      决策人: fact.customerProfile?.decisionMakers,
      决策链状态: fact.customerProfile?.decisionChainStatus,
      竞品: fact.customerProfile?.competitors,
      对比维度: fact.customerProfile?.comparisonDimension
    }, fact.evidence);

    addInsightFieldRows(rows, base, "客户标签", "客户洞察标签", {
      意向等级: fact.customerTags?.intentLevel,
      购买阶段: fact.customerTags?.purchaseStage,
      显性异议: fact.customerTags?.objections,
      关注点: fact.customerTags?.concerns,
      跟进价值: fact.customerTags?.followUpValue,
      价格敏感度: fact.customerTags?.priceSensitivity,
      紧迫程度: fact.customerTags?.urgencyLevel
    }, fact.evidence);

    for (const item of Array.isArray(fact.extractedFacts) ? fact.extractedFacts : []) {
      rows.push({
        ...base,
        resultType: "事实层实体字段",
        category: item.category || "",
        fieldKey: item.key || "",
        fieldName: item.field || "",
        fieldPrompt: item.modelPrompt || "",
        fieldValue: formatFactCellValue(item.value),
        ...evidenceColumns(firstFactEvidence(item))
      });
    }

    for (const item of Array.isArray(fact.customerObjections) ? fact.customerObjections : []) {
      rows.push({
        ...base,
        resultType: "客户异议事实",
        category: item.type || "异议",
        fieldKey: "",
        fieldName: item.label || item.type || "异议",
        fieldPrompt: "",
        fieldValue: stringifyCell({ 强度: item.strength, 处理状态: item.handling }),
        ...evidenceColumns(item.evidence)
      });
    }

    for (const [key, value] of Object.entries(fact.sopActions || {})) {
      rows.push({
        ...base,
        resultType: "销售SOP动作事实",
        category: "SOP动作",
        fieldKey: key,
        fieldName: sopLabelForExport(key),
        fieldPrompt: "",
        fieldValue: value ? "已完成" : "未完成",
        ...evidenceColumns(firstEvidence(fact.evidence))
      });
    }

    for (const item of Array.isArray(fact.evidence) ? fact.evidence : []) {
      rows.push({
        ...base,
        resultType: "证据片段",
        category: item.type || "证据",
        fieldKey: "",
        fieldName: item.type || "关键原话",
        fieldPrompt: "",
        fieldValue: item.quote || "",
        ...evidenceColumns(item)
      });
    }

    return rows;
  });
}

function getAnalyzedRows(sessionId = "") {
  const where = sessionId ? "WHERE s.id = ?" : "";
  const params = sessionId ? [sessionId] : [];
  return db
    .prepare(`
      SELECT
        s.*,
        a.based_on_version,
        a.fact_package,
        a.diagnoses,
        a.strategies,
        a.generated_cards,
        a.score,
        a.analyzed_at
      FROM sessions s
      INNER JOIN analyses a ON a.session_id = s.id
      ${where}
      ORDER BY a.analyzed_at DESC, s.created_at DESC
    `)
    .all(...params)
    .map((row) => ({
      session: row,
      analysis: sanitizeAnalysisResult({
        basedOnVersion: row.based_on_version,
        factPackage: parseJsonCell(row.fact_package, {}),
        diagnoses: parseJsonCell(row.diagnoses, []),
        strategies: parseJsonCell(row.strategies, []),
        generatedCards: parseJsonCell(row.generated_cards, []),
        score: row.score,
        analyzedAt: row.analyzed_at
      })
    }));
}

function exportBase(session, analysis) {
  const promptSnapshot = analysis.factPackage?.factExtractionMeta?.promptSnapshot || {};
  return {
    recordingId: session.id,
    receptionNo: session.reception_no,
    store: session.store,
    salesperson: session.salesperson,
    customerName: session.customer_name,
    startAt: session.start_at,
    durationSeconds: session.duration_seconds,
    segmentType: session.segment_type,
    qualityStatus: session.quality_status,
    analysisStatus: session.analysis_status,
    transcriptSource: session.transcript_source,
    basedOnVersion: analysis.basedOnVersion,
    score: analysis.score,
    analyzedAt: analysis.analyzedAt,
    factSystemPrompt: promptSnapshot.systemPrompt || "",
    factUserPrompt: promptSnapshot.userPromptTemplate || ""
  };
}

function addInsightFieldRows(rows, base, resultType, category, fields, evidenceList = []) {
  for (const [fieldName, value] of Object.entries(fields)) {
    rows.push({
      ...base,
      resultType,
      category,
      fieldKey: "",
      fieldName,
      fieldPrompt: "",
      fieldValue: stringifyCell(value ?? "未提及"),
      ...evidenceColumns(firstEvidence(evidenceList))
    });
  }
}

const exportFactKeyLabels = {
  main_scene: "主场景",
  sub_scene: "次场景",
  sales_stage: "销售阶段",
  use_case: "使用场景",
  explicit_or_inferred: "证据类型",
  budget_value: "预算金额/预算信息",
  price_sensitivity: "价格敏感度",
  purchase_timeline: "购买周期",
  urgency_level: "紧迫程度",
  decision_makers: "决策人/影响人",
  decision_chain_status: "决策链状态",
  concerns: "关注点",
  competitors: "竞品",
  comparison_dimension: "对比维度",
  explicit_objections: "显性异议",
  implicit_objections: "隐性异议",
  objection_strength: "异议强度",
  strength: "强度",
  inference_basis: "推断依据",
  reason: "原因",
  intent_level: "意向等级",
  positive_signals: "正向信号",
  negative_signals: "负向信号",
  follow_up_value: "跟进价值",
  sop_actions: "SOP动作",
  need_discovery_quality: "需求挖掘质量",
  missing_items: "缺失项",
  product_explanation_match: "产品讲解匹配度",
  objection_handling: "异议处理情况",
  closing_actions: "成交推进动作",
  missing_closing_actions: "缺失成交动作",
  follow_up_closure: "离店跟进闭环",
  next_step_confirmed: "是否确认下一步",
  sales_strengths: "销售优点",
  sales_weaknesses: "销售短板",
  candidate_scripts: "优秀话术候选",
  completed_sop: "已完成SOP",
  missing_sop: "未完成SOP",
  quote_provided: "是否报价",
  followup_time: "跟进时间",
  next_step: "下一步动作",
  evidence: "证据",
  risk_segments: "风险片段"
};

const exportFactValueLabels = {
  explicit: "明确表达",
  inferred: "基于原文推断",
  "explicit/inferred": "明确表达或强相关推断",
  explicit_or_inferred: "明确表达或强相关推断"
};

function firstFactEvidence(item) {
  const direct = normalizeExportEvidence(item?.evidence);
  if (direct.length) return direct[0];
  const nested = item?.value && typeof item.value === "object" && !Array.isArray(item.value) ? item.value.evidence : null;
  return firstEvidence(normalizeExportEvidence(nested));
}

function normalizeExportEvidence(value) {
  if (!value) return [];
  if (typeof value === "string") return evidenceFromTextForExport(value);
  if (Array.isArray(value)) return value.flatMap((item) => normalizeExportEvidence(item));
  if (typeof value === "object") {
    const quote = String(value.quote || value.text || value.evidence || "").trim();
    if (!quote) return [];
    return [{
      timestamp: String(value.timestamp || value.time || ""),
      speaker: String(value.speaker || value.role || "原文"),
      quote,
      type: String(value.type || value.riskType || "原文证据")
    }];
  }
  return [];
}

function evidenceFromTextForExport(text) {
  return String(text)
    .split(/；|;|\n+/)
    .map((part) => part.replace(/^\s*\d+[.、]\s*/, "").trim())
    .filter(Boolean)
    .map((part) => {
      const timestamp = part.match(/\(?(\d{1,2}:\d{2}(?:[-~至]\d{1,2}:\d{2})?)\)?/)?.[1] || "";
      const quote = part
        .replace(/\(?\d{1,2}:\d{2}(?:[-~至]\d{1,2}:\d{2})?\)?/g, "")
        .replace(/^[^：""]+[：:]\s*/, "")
        .replace(/^["“]|["”]$/g, "")
        .trim();
      return {
        timestamp,
        speaker: "原文",
        quote: quote || part,
        type: "原文证据"
      };
    });
}

function formatFactCellValue(value) {
  if (Array.isArray(value)) return value.map((item) => formatFactCellValue(item)).join("、");
  if (!value || typeof value !== "object") {
    const text = value == null ? "" : String(value);
    return exportFactValueLabels[text] || text;
  }
  return Object.entries(value)
    .filter(([key]) => !["evidence", "confidence", "置信度"].includes(key))
    .map(([key, item]) => `${exportFactKeyLabels[key] || key.replace(/_/g, " ")}：${formatFactCellValue(item)}`)
    .join("；");
}

function formatExportRequirementLabels(value = "") {
  return String(value)
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => exportFactKeyLabels[item.replace(/\[\]|\{\}$/g, "")] || item)
    .join("、");
}

function firstEvidence(evidence) {
  const normalized = sanitizeEvidenceList(evidence);
  return normalized[0] || null;
}

function evidenceColumns(evidence) {
  return {
    evidenceTimestamp: evidence?.timestamp || "",
    evidenceSpeaker: evidence?.speaker || "",
    evidenceType: evidence?.type || evidence?.riskType || "",
    evidenceQuote: evidence?.quote || ""
  };
}

function parseJsonCell(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function sanitizeAnalysisResult(analysis) {
  if (!analysis) return null;
  const diagnoses = Array.isArray(analysis.diagnoses) ? analysis.diagnoses : [];
  const strategies = Array.isArray(analysis.strategies) ? analysis.strategies : [];
  const generatedCards = Array.isArray(analysis.generatedCards)
    ? analysis.generatedCards.filter((item) => item?.id !== "card_next_action" && item?.type !== "下一步跟进建议")
    : [];
  return {
    ...analysis,
    diagnoses: diagnoses.map((item) => ({ ...item, evidence: sanitizeEvidenceList(item.evidence) })),
    strategies: strategies.map((item) => ({ ...item, evidenceToShow: sanitizeEvidenceList(item.evidenceToShow) })),
    generatedCards: generatedCards.map((item) => ({ ...item, evidence: sanitizeEvidenceList(item.evidence) }))
  };
}

function sanitizeEvidenceList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => sanitizeEvidenceList(item));
  if (typeof value === "string") {
    const quote = value.trim();
    return quote ? [{ timestamp: "", speaker: "原文", quote, type: "原文证据" }] : [];
  }
  if (typeof value === "object") {
    const quote = String(value.quote || value.text || value.evidence || "").trim();
    if (!quote) return [];
    return [{
      timestamp: String(value.timestamp || value.time || ""),
      speaker: String(value.speaker || value.role || "原文"),
      quote,
      type: String(value.type || value.riskType || "原文证据")
    }];
  }
  return [];
}

function stringifyCell(value) {
  if (Array.isArray(value)) return value.map((item) => stringifyCell(item)).join("、");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value == null ? "" : String(value);
}

function sendCsv(res, filename, headers, rows) {
  const csvRows = [headers.map(([label]) => label), ...rows.map((row) => headers.map(([, key]) => row[key] ?? ""))];
  const content = `\uFEFF${csvRows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(content);
}

function escapeCsvCell(value) {
  const text = stringifyCell(value).replace(/\r?\n/g, " ");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function sopLabelForExport(key) {
  const labels = {
    asked_use_case: "确认用途/场景",
    asked_budget: "确认预算",
    asked_purchase_timeline: "确认购买周期",
    asked_decision_maker: "确认决策人",
    introduced_product_by_need: "按需求讲解产品",
    invited_test_drive: "邀约试驾/体验",
    quoted_price: "报价",
    handled_objection: "处理异议",
    confirmed_next_followup: "确认下一步跟进"
  };
  return labels[key] || key;
}

function buildMetrics() {
  const total = db.prepare("SELECT count(*) AS count FROM sessions").get().count;
  const analyzed = db.prepare("SELECT count(*) AS count FROM sessions WHERE analysis_status LIKE '已分析%'").get().count;
  const reviewed = db.prepare("SELECT count(*) AS count FROM feedback WHERE action IN ('认可', '确认风险', '通过话术', '采纳')").get().count;
  const repaired = db.prepare("SELECT count(DISTINCT session_id) AS count FROM transcripts WHERE version LIKE 'human_%'").get().count;
  const avgScore = db.prepare("SELECT avg(score) AS score FROM analyses").get().score;
  return {
    totalSessions: total,
    analyzedSessions: analyzed,
    reviewEvents: reviewed,
    repairedSessions: repaired,
    avgScore: avgScore ? Math.round(avgScore) : 0
  };
}
