import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

type PageKey = "sessions" | "workspace" | "insights" | "evidenceChain" | "semanticGraph" | "feedback" | "sopConfig" | "insightConfig" | "semanticModel" | "advancedConfig" | "config" | "llm";

type ReceptionSession = {
  id: string;
  reception_no: string;
  store: string;
  salesperson: string;
  customer_name: string;
  start_at: string;
  end_at?: string | null;
  durationSeconds: number;
  segmentType: string;
  qualityStatus: string;
  analysisStatus: string;
  transcriptSource: string;
  audioPath?: string | null;
  asrStatus: string;
  asrProvider?: string;
  asrTaskId?: string;
  asrError?: string;
  activeVersion: string;
  createdAt: string;
  updatedAt: string;
  utteranceCount?: number;
  feedbackCount?: number;
  score?: number | null;
};

type TranscriptUtterance = {
  id: string;
  sessionId: string;
  version: string;
  index: number;
  startSec: number;
  endSec: number;
  role: string;
  text: string;
  included: boolean;
  status: string;
  issueType?: string;
  originalId?: string;
};

type Evidence = {
  speaker: string;
  quote: string;
  timestamp: string;
  type?: string;
};

type DiagnosisResult = {
  id: string;
  issue: string;
  category: string;
  riskLevel: string;
  reason?: string;
  recoverable: boolean;
  manualReviewRequired?: boolean;
  evidence: Evidence[];
  ruleId: string;
  priority?: string;
  factBasis?: Record<string, string[]>;
};

type StrategyResult = {
  id: string;
  strategyId: string;
  diagnosisId: string;
  issue: string;
  nextBestAction: string;
  priority: string;
  timing: string;
  channel: string;
  materials: string[];
  templateKey: string;
  needManagerIntervention: boolean;
  evidenceToShow: Evidence[];
  strategyCategory?: string;
  strategyPriority?: number;
  strategyTitle?: string;
  strategyObjective?: string;
  actionSteps?: string[];
  strategySource?: string;
};

type GeneratedCard = {
  id: string;
  type: string;
  title: string;
  status: string;
  content: string;
  evidence: Evidence[];
  actions: string[];
  managerIntervention?: boolean;
  managerAlert?: { required: boolean; channel?: string; recipientRole?: string; status: string };
  scoreDetail?: Array<{ keyword: string; score: number; sourceLevel: string; evidence?: Evidence }>;
  generationSpec?: Record<string, unknown>;
};

type Analysis = {
  basedOnVersion: string;
  factPackage: any;
  diagnoses: DiagnosisResult[];
  strategies: StrategyResult[];
  generatedCards: GeneratedCard[];
  semanticPackage?: any;
  score: number;
  analyzedAt: string;
};

type DecisionFactRow = {
  factCode: string;
  fieldName: string;
  category: string;
  value: string;
  status: string;
  source: string;
  evidence: Evidence[];
  downstreamUses: string[];
};

type FactEdit = Pick<DecisionFactRow, "factCode" | "value" | "status">;

type FeedbackEvent = {
  id: string;
  actorType: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
};

type SessionDetail = {
  session: ReceptionSession;
  transcript: TranscriptUtterance[];
  originalTranscript: TranscriptUtterance[];
  analysis: Analysis | null;
  feedback: FeedbackEvent[];
};

type Metrics = {
  totalSessions: number;
  analyzedSessions: number;
  reviewEvents: number;
  repairedSessions: number;
  avgScore: number;
};

type AsrConfigStatus = {
  provider: string;
  activeProvider?: string;
  configured: boolean;
  missing: string[];
  region: string;
  endpoint: string;
  publicBaseUrl?: string;
  publicBaseUrlConfigured: boolean;
  funasr?: {
    configured: boolean;
    endpoint: string;
    audioField: string;
    responsePath: string;
    missing: string[];
  };
  aliyun?: {
    configured: boolean;
    region: string;
    endpoint: string;
    publicBaseUrl?: string;
    publicBaseUrlConfigured: boolean;
    missing: string[];
  };
  oss?: {
    configured: boolean;
    bucket: string;
    region: string;
    endpoint: string;
    prefix: string;
    missing: string[];
  };
};

type LlmConfigStatus = {
  configured: boolean;
  missing: string[];
  provider: string;
  displayName: string;
  baseUrl: string;
  modelName: string;
  apiKeySet: boolean;
  temperature: number;
  topP: number;
  maxCompletionTokens: number;
  enableThinking: boolean;
  factLayerEnabled: boolean;
  modelEnabled: boolean;
};

type ManagerWechatConfigStatus = {
  configured: boolean;
  webhookSet: boolean;
  webhookHint: string;
  userIdsSet: boolean;
  mobilesSet: boolean;
  recipientCount: number;
  missing: string[];
};

type AnalysisConfig = {
  sop: Array<{ stage: string; field: string; label: string; missingDiagnosis: string }>;
  factExtractionFields?: Array<{ key: string; category: string; field: string; meaning: string; modelPrompt: string; outputRequirement: string; allowedValues?: string; enabled: boolean; requiresEvidence: boolean }>;
  customerTags: Record<string, string[]>;
  salesTags: Record<string, string[]>;
  complianceForbidden: Array<{ type: string; phrase: string }>;
  strategyTemplates: Record<
    string,
    {
      strategyId: string;
      action: string;
      timing: string;
      channel: string;
      materials: string[];
      templateKey: string;
    }
  >;
  strategyLibrary?: Array<Record<string, unknown>>;
  generationSpecs?: Record<string, Record<string, unknown>>;
  feedbackOptions: Record<string, string[]>;
  factLayer?: Record<string, any>;
  diagnosisLayer?: Record<string, any>;
  strategyLayer?: Record<string, any>;
  generationLayer?: Record<string, any>;
  feedbackLayer?: Record<string, any>;
  customerInsightRules?: Record<string, any>;
  advancedCapabilities?: Record<string, any>;
  semanticModel?: {
    entities: Array<{ name: string; description: string; enabled: boolean }>;
    attributes: Array<{ entity: string; name: string; dataType: string; required: boolean; description: string }>;
    relationships: Array<{ source: string; relation: string; target: string; description: string; enabled: boolean }>;
    enums: Array<{ name: string; values: string; description: string }>;
    synonyms: Array<{ canonical: string; aliases: string; scope: string }>;
    brandExtensions: Array<{ brand: string; entity: string; property: string; value: string; enabled: boolean }>;
  };
};

type CheckObject = {
  enabled?: boolean;
  code: string;
  name: string;
  type: string;
  description: string;
  llmMeaning: string;
  judgmentRule: string;
  evidenceRequirement: string;
};

const navItems: Array<{ key: PageKey; label: string; icon: string }> = [
  { key: "sessions", label: "接待会话中心", icon: "list" },
  { key: "workspace", label: "单次接待工作台", icon: "wave" },
  { key: "insights", label: "客户洞察/质检结果", icon: "target" },
  { key: "evidenceChain", label: "证据与推理链", icon: "chain" },
  { key: "semanticGraph", label: "语义图谱视图", icon: "graph" },
  { key: "feedback", label: "反馈与持续优化", icon: "loop" },
  { key: "sopConfig", label: "销售SOP质检配置", icon: "check" },
  { key: "insightConfig", label: "客户洞察标签配置", icon: "tag" },
  { key: "semanticModel", label: "本体与配置中心", icon: "model" },
  { key: "advancedConfig", label: "高级能力配置", icon: "spark" },
  { key: "llm", label: "千问大模型配置", icon: "spark" },
  { key: "config", label: "规则配置中心", icon: "settings" }
];

const proItems = ["客户360", "经营预测", "自动创建跟进任务"];

function App() {
  const [page, setPage] = useState<PageKey>("sessions");
  const [sessions, setSessions] = useState<ReceptionSession[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useState<TranscriptUtterance[]>([]);
  const [asrConfig, setAsrConfig] = useState<AsrConfigStatus | null>(null);
  const [llmConfig, setLlmConfig] = useState<LlmConfigStatus | null>(null);
  const [managerWechatConfig, setManagerWechatConfig] = useState<ManagerWechatConfigStatus | null>(null);
  const [analysisConfig, setAnalysisConfig] = useState<AnalysisConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void refreshSessions();
    void loadAsrConfig();
    void loadLlmConfig();
    void loadManagerWechatConfig();
    void loadAnalysisConfig();
  }, []);

  useEffect(() => {
    if (!selectedId && sessions[0]?.id) {
      setSelectedId(sessions[0].id);
    }
  }, [sessions, selectedId]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  async function refreshSessions() {
    const result = await api<{ sessions: ReceptionSession[]; metrics: Metrics }>("/api/sessions");
    setSessions(result.sessions);
    setMetrics(result.metrics);
  }

  async function loadDetail(id: string) {
    const result = await api<SessionDetail>(`/api/sessions/${id}`);
    setDetail(result);
    setDraft(result.transcript);
  }

  async function loadAsrConfig() {
    const result = await api<AsrConfigStatus>("/api/asr/config");
    setAsrConfig(result);
  }

  async function loadLlmConfig() {
    const result = await api<LlmConfigStatus>("/api/llm/config");
    setLlmConfig(result);
  }

  async function loadManagerWechatConfig() {
    const result = await api<ManagerWechatConfigStatus>("/api/manager-wechat/config");
    setManagerWechatConfig(result);
  }

  async function loadAnalysisConfig() {
    const result = await api<AnalysisConfig>("/api/analysis-config");
    setAnalysisConfig(result);
  }


  async function saveAsrConfig(payload: Record<string, string>) {
    setLoading(true);
    try {
      const result = await api<AsrConfigStatus>("/api/asr/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setAsrConfig(result);
      setMessage(result.configured ? `ASR配置已保存：${formatProviderLabel(result.activeProvider || result.provider)}` : `ASR配置已保存，但还缺：${formatMissingConfigItems(result.missing).join("、")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ASR配置保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveLlmConfig(payload: Record<string, string | number | boolean>) {
    setLoading(true);
    try {
      const result = await api<LlmConfigStatus>("/api/llm/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setLlmConfig(result);
      await loadAnalysisConfig();
      setMessage(result.configured ? "千问大模型已绑定到事实层抽取。" : `千问大模型配置已保存，但还缺：${result.missing.join("、")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "千问大模型配置保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveManagerWechatConfig(payload: Record<string, string | boolean>) {
    setLoading(true);
    try {
      const result = await api<ManagerWechatConfigStatus>("/api/manager-wechat/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setManagerWechatConfig(result);
      setMessage(result.configured ? "店长企业微信通知配置已保存，可发送测试通知。" : `通知配置还缺：${result.missing.join("、")}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "店长企业微信通知配置保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function testManagerWechat() {
    setLoading(true);
    try {
      const result = await api<{ ok: boolean; status: string }>("/api/manager-wechat/test", { method: "POST" });
      setMessage(result.ok ? "测试通知已推送，请让店长查看企业微信群消息。" : `测试未发送：${result.status}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "测试通知发送失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveAnalysisConfig(nextConfig: AnalysisConfig) {
    setLoading(true);
    try {
      const result = await api<AnalysisConfig>("/api/analysis-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig)
      });
      setAnalysisConfig(result);
      setMessage("规则配置已保存，下一次重新分析会按新配置执行。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "规则配置保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function createSession(payload: FormData | Record<string, unknown>) {
    setLoading(true);
    setMessage("");
    try {
      const result = await api<SessionDetail>("/api/sessions", {
        method: "POST",
        body: payload instanceof FormData ? payload : JSON.stringify(payload),
        headers: payload instanceof FormData ? undefined : { "Content-Type": "application/json" }
      });
      await refreshSessions();
      setSelectedId(result.session.id);
      setDetail(result);
      setDraft(result.transcript);
      setPage("workspace");
      if (result.session.asrTaskId && !result.transcript.length) {
        setMessage("阿里云ASR任务已提交，正在自动查询转写结果...");
        await autoPollAsr(result.session.id);
      } else {
        setMessage(result.session.asrStatus === "待转写/可补充文本" ? "录音任务已创建，请补充ASR文本后再分析。" : "接待记录已创建，可进入修正或分析。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveTranscript() {
    if (!detail) return;
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/transcript`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utterances: draft })
      });
      setDetail(result);
      setDraft(result.transcript);
      await refreshSessions();
      setMessage("人工修正版本已保存，后续分析将基于该版本。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function mapSpeakerRoles() {
    if (!detail) return;
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/map-speaker-roles`, { method: "POST" });
      setDetail(result);
      setDraft(result.transcript);
      await refreshSessions();
      setMessage("整通语义角色标定完成：匿名说话人已映射为销售/主客户，请人工复核后再分析。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "角色标定失败");
    } finally {
      setLoading(false);
    }
  }

  async function analyze() {
    if (!detail) return;
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/analyze`, {
        method: "POST"
      });
      setDetail(result);
      setDraft(result.transcript);
      await refreshSessions();
      setPage("insights");
      setMessage("分析完成：事实层、诊断层、策略层、生成层已更新。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "分析失败");
    } finally {
      setLoading(false);
    }
  }

  async function rebuildDownstream() {
    if (!detail?.analysis) {
      setMessage("当前接待还没有事实层结果，请先执行一次完整分析。");
      return;
    }
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/rebuild-downstream`, { method: "POST" });
      setDetail(result);
      await refreshSessions();
      setPage("insights");
      setMessage("已复用现有事实包刷新诊断、策略和三项高级能力，本次没有再次调用大模型。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveFactEdits(edits: FactEdit[]) {
    if (!detail?.analysis) return;
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/facts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edits })
      });
      setDetail(result);
      await refreshSessions();
      setMessage("事实修正已保存，客户洞察、SOP、诊断、策略、生成卡片和评分已自动联动刷新；本次未调用大模型。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "事实修正保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function startAsr() {
    if (!detail) return;
    setLoading(true);
    try {
      const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/asr/start`, { method: "POST" });
      setDetail(result);
      await refreshSessions();
      if (result.session.asrTaskId && !result.transcript.length) {
        setMessage("阿里云ASR任务已提交，正在自动查询转写结果...");
        await autoPollAsr(result.session.id);
      } else {
        setDraft(result.transcript);
        setMessage(result.transcript.length ? "ASR转写完成，已生成可修正文本。" : "阿里云ASR任务已提交。");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ASR提交失败");
    } finally {
      setLoading(false);
    }
  }

  async function pollAsr() {
    if (!detail) return;
    setLoading(true);
    try {
      await pollAsrById(detail.session.id);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ASR查询失败");
    } finally {
      setLoading(false);
    }
  }

  async function pollAsrById(sessionId: string, silent = false) {
    const result = await api<SessionDetail>(`/api/sessions/${sessionId}/asr/poll`, { method: "POST" });
    setDetail(result);
    setDraft(result.transcript);
    await refreshSessions();
    if (!silent) {
      setMessage(result.transcript.length ? `ASR转写完成，已生成 ${result.transcript.length} 句可修正文本。` : `当前状态：${result.session.asrStatus}`);
    }
    return result;
  }

  async function autoPollAsr(sessionId: string) {
    for (let index = 0; index < 24; index += 1) {
      const result = await pollAsrById(sessionId, true);
      if (result.transcript.length) {
        setMessage(`ASR转写完成，已生成 ${result.transcript.length} 句可修正文本。`);
        return;
      }
      if (result.session.asrStatus.includes("失败") || result.session.asrStatus.includes("没有返回")) {
        setMessage(`ASR未完成：${result.session.asrStatus}`);
        return;
      }
      setMessage(`ASR处理中：${formatStatusText(result.session.asrStatus)}，系统正在自动查询...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    setMessage("ASR仍在处理中，可稍后点击“查询转写结果”继续刷新。");
  }

  async function sendFeedback(action: string, target = "generated_card", actorType = "sales", details?: string) {
    if (!detail) return;
    const result = await api<SessionDetail>(`/api/sessions/${detail.session.id}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actorType, action, target, details: details || `${action} - ${new Date().toLocaleString("zh-CN")}` })
    });
    setDetail(result);
    await refreshSessions();
    setMessage(`已记录反馈：${action}`);
  }

  const selectedSession = useMemo(() => sessions.find((item) => item.id === selectedId), [sessions, selectedId]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">质</div>
          <div>
            <strong>汽车销售会话决策智能系统</strong>
            <span>销售执行与客户决策智能平台</span>
          </div>
        </div>
        <nav>
          {navItems.map((item) => (
            <button key={item.key} className={page === item.key ? "active" : ""} onClick={() => setPage(item.key)}>
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="proBox">
          <span>高级能力预留</span>
          {proItems.map((item) => (
            <small key={item}>{item}</small>
          ))}
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{navItems.find((item) => item.key === page)?.label}</h1>
            <p>一次事实抽取，本体统一口径，规则驱动决策，反馈连接结果与复检。</p>
          </div>
          <div className="topActions">
            <StatusChip label={formatStatusText(selectedSession?.analysisStatus || "待创建")} tone="blue" />
            <button className="primary" onClick={analyze} disabled={!detail || loading}>
              <Icon name="spark" />
              重新分析/评分
            </button>
          </div>
        </header>

        {message && <div className="notice">{message}</div>}

        {page === "sessions" && (
          <SessionsPage
            sessions={sessions}
            metrics={metrics}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setPage("workspace");
            }}
            onCreate={createSession}
            asrConfig={asrConfig}
            onSaveAsrConfig={saveAsrConfig}
            loading={loading}
          />
        )}

        {page === "workspace" && (
          <WorkspacePage
            detail={detail}
            draft={draft}
            setDraft={setDraft}
            onSave={saveTranscript}
            onMapSpeakerRoles={mapSpeakerRoles}
            onAnalyze={analyze}
            onSaveFactEdits={saveFactEdits}
            onStartAsr={startAsr}
            onPollAsr={pollAsr}
            onCreate={createSession}
            asrConfig={asrConfig}
            loading={loading}
          />
        )}

        {page === "insights" && <InsightsPage detail={detail} onFeedback={sendFeedback} />}

        {page === "evidenceChain" && <EvidenceReasoningPage detail={detail} />}

        {page === "semanticGraph" && <SemanticGraphPage detail={detail} />}

        {page === "feedback" && <FeedbackPage detail={detail} metrics={metrics} onFeedback={sendFeedback} />}

        {page === "sopConfig" && <SopQualityConfigPage config={analysisConfig} onSave={saveAnalysisConfig} loading={loading} />}

        {page === "insightConfig" && <CustomerInsightConfigPage config={analysisConfig} onSave={saveAnalysisConfig} loading={loading} />}

        {page === "semanticModel" && <SemanticModelPage config={analysisConfig} onSave={saveAnalysisConfig} loading={loading} />}

        {page === "advancedConfig" && <AdvancedCapabilitiesConfigPage config={analysisConfig} onSave={saveAnalysisConfig} onRebuild={rebuildDownstream} canRebuild={Boolean(detail?.analysis)} loading={loading} />}

        {page === "llm" && <LlmConfigPage config={llmConfig} onSave={saveLlmConfig} loading={loading} />}

        {page === "config" && <ConfigPage config={analysisConfig} onSave={saveAnalysisConfig} managerWechatConfig={managerWechatConfig} onSaveManagerWechat={saveManagerWechatConfig} onTestManagerWechat={testManagerWechat} loading={loading} />}

      </main>
    </div>
  );
}

function SessionsPage({
  sessions,
  metrics,
  selectedId,
  onSelect,
  onCreate,
  asrConfig,
  onSaveAsrConfig,
  loading
}: {
  sessions: ReceptionSession[];
  metrics: Metrics | null;
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (payload: FormData | Record<string, unknown>) => void;
  asrConfig: AsrConfigStatus | null;
  onSaveAsrConfig: (payload: Record<string, string>) => void;
  loading: boolean;
}) {
  return (
    <section className="pageGrid">
      <UploadPanel onCreate={onCreate} loading={loading} />
      <AsrConfigPanel config={asrConfig} onSave={onSaveAsrConfig} loading={loading} />
      <div className="panel metricsPanel sessionMetrics">
        <Metric label="接待记录" value={metrics?.totalSessions ?? 0} />
        <Metric label="已分析" value={metrics?.analyzedSessions ?? 0} />
        <Metric label="修正会话" value={metrics?.repairedSessions ?? 0} />
        <Metric label="平均质检分" value={metrics?.avgScore ?? 0} />
      </div>
      <div className="panel full">
        <div className="sectionTitle">
          <h2>接待会话中心</h2>
          <span>全天录音经客流切分后形成的接待记录，可进入单次工作台复核。</span>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>接待编号</th>
                <th>门店/销售</th>
                <th>片段类型</th>
                <th>ASR状态</th>
                <th>分析状态</th>
                <th>质检分</th>
                <th>反馈</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((item) => (
                <tr key={item.id} className={selectedId === item.id ? "selectedRow" : ""} onClick={() => onSelect(item.id)}>
                  <td>
                    <strong>{item.reception_no}</strong>
                    <small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small>
                  </td>
                  <td>
                    {item.store}
                    <small>{item.salesperson}</small>
                  </td>
                  <td>{item.segmentType}</td>
                  <td>
                    <StatusChip label={formatStatusText(item.asrStatus)} tone={item.asrStatus.includes("待") ? "amber" : "teal"} />
                  </td>
                  <td>
                    <StatusChip label={formatStatusText(item.analysisStatus)} tone={item.analysisStatus.includes("已分析") ? "blue" : "gray"} />
                  </td>
                  <td>{item.score ?? "--"}</td>
                  <td>{item.feedbackCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function UploadPanel({ onCreate, loading }: { onCreate: (payload: FormData | Record<string, unknown>) => void; loading: boolean }) {
  const [store, setStore] = useState("深圳宝安大仟里店");
  const [salesperson, setSalesperson] = useState("黄静仪");
  const [customerName, setCustomerName] = useState("临时客户");
  const [asrText, setAsrText] = useState("");
  const [audio, setAudio] = useState<File | null>(null);

  function submitText() {
    onCreate({ store, salesperson, customerName, asrText });
  }

  function submitAudio() {
    const fd = new FormData();
    fd.set("store", store);
    fd.set("salesperson", salesperson);
    fd.set("customerName", customerName);
    if (audio) fd.set("audio", audio);
    onCreate(fd);
  }

  return (
    <div className="panel uploadPanel">
      <div className="sectionTitle">
        <h2>上传链路</h2>
        <span>支持录音任务或ASR文本直传；未配置ASR时不伪装分析结果。</span>
      </div>
      <div className="formGrid">
        <label>
          门店
          <input value={store} onChange={(event) => setStore(event.target.value)} />
        </label>
        <label>
          销售
          <input value={salesperson} onChange={(event) => setSalesperson(event.target.value)} />
        </label>
        <label>
          客户
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} />
        </label>
      </div>
      <label className="textareaLabel">
        ASR转写文本
        <textarea value={asrText} onChange={(event) => setAsrText(event.target.value)} rows={8} placeholder="请粘贴真实ASR转写文本；未填写时不会创建文本接待。" />
      </label>
      <div className="uploadActions">
        <button className="primary" onClick={submitText} disabled={loading || !asrText.trim()}>
          <Icon name="upload" />
          上传ASR文本并创建接待
        </button>
        <label className="fileButton">
          <Icon name="audio" />
          选择录音
          <input type="file" accept="audio/*" onChange={(event) => setAudio(event.target.files?.[0] || null)} />
        </label>
        <button onClick={submitAudio} disabled={loading || !audio}>
          上传录音并提交ASR
        </button>
      </div>
      {audio && <small className="hint">已选择录音：{audio.name}</small>}
    </div>
  );
}

function AsrConfigPanel({ config, onSave, loading }: { config: AsrConfigStatus | null; onSave: (payload: Record<string, string>) => void; loading: boolean }) {
  const [provider, setProvider] = useState("funasr");
  const [funasrEndpoint, setFunasrEndpoint] = useState("http://127.0.0.1:10095/asr");
  const [funasrAudioField, setFunasrAudioField] = useState("audio");
  const [funasrResponsePath, setFunasrResponsePath] = useState("auto");
  const [aliyunRegion, setAliyunRegion] = useState("cn-shanghai");
  const [aliyunPublicBaseUrl, setAliyunPublicBaseUrl] = useState("");

  useEffect(() => {
    if (!config) return;
    setProvider(config.activeProvider || config.provider || "funasr");
    setFunasrEndpoint(config.funasr?.endpoint || "http://127.0.0.1:10095/asr");
    setFunasrAudioField(config.funasr?.audioField || "audio");
    setFunasrResponsePath(config.funasr?.responsePath || "auto");
    setAliyunRegion(config.aliyun?.region || config.region || "cn-shanghai");
    setAliyunPublicBaseUrl(config.aliyun?.publicBaseUrl || config.publicBaseUrl || config.oss?.endpoint || "");
  }, [config]);

  function submit() {
    onSave({
      provider,
      funasrEndpoint,
      funasrAudioField,
      funasrResponsePath,
      aliyunRegion,
      aliyunPublicBaseUrl
    });
  }

  return (
    <div className="panel asrPanel">
      <div className="sectionTitle">
        <h2>ASR配置</h2>
        <span>FunASR适合本地/内网服务；阿里云ASR需要公网音频URL。</span>
      </div>
      {!config ? (
        <StatusChip label="读取中" tone="gray" />
      ) : (
        <>
          <div className="statusRow">
            <StatusChip label={config.configured ? "已配置" : "未完整配置"} tone={config.configured ? "teal" : "amber"} />
            <StatusChip label={formatProviderLabel(config.activeProvider || config.provider)} tone="blue" />
          </div>
          <div className="asrForm">
            <label>
              ASR类型
              <select value={provider} onChange={(event) => setProvider(event.target.value)}>
                <option value="funasr">FunASR 本地/自建服务</option>
                <option value="aliyun">阿里云录音文件识别</option>
                <option value="none">暂不启用</option>
              </select>
            </label>

            {provider === "funasr" && (
              <>
                <label>
                  FunASR服务地址
                  <input value={funasrEndpoint} onChange={(event) => setFunasrEndpoint(event.target.value)} placeholder="http://127.0.0.1:10095/asr" />
                </label>
                <div className="formGrid two">
                  <label>
                    文件字段名
                    <input value={funasrAudioField} onChange={(event) => setFunasrAudioField(event.target.value)} placeholder="audio" />
                  </label>
                  <label>
                    返回文本路径
                    <input value={funasrResponsePath} onChange={(event) => setFunasrResponsePath(event.target.value)} placeholder="auto 或 data.text" />
                  </label>
                </div>
              </>
            )}

            {provider === "aliyun" && (
              <>
                <label>
                  阿里云地域
                  <input value={aliyunRegion} onChange={(event) => setAliyunRegion(event.target.value)} placeholder="cn-shanghai" />
                </label>
                <label>
                  公网音频URL基座
                  <input value={aliyunPublicBaseUrl} onChange={(event) => setAliyunPublicBaseUrl(event.target.value)} placeholder="https://your-public-domain.example.com" />
                </label>
                {config.oss?.endpoint && <small className="hint">当前OSS访问域名：{config.oss.endpoint}</small>}
                <small className="hint">AccessKey、Secret、AppKey 建议仍写在 .env，避免页面明文展示。</small>
              </>
            )}

            <button className="primary" onClick={submit} disabled={loading || provider === "none"}>
              <Icon name="save" />
              保存ASR配置
            </button>
          </div>
          <div className="auditList">
            {config.configured ? <span>配置可用。上传录音后会自动提交当前ASR服务。</span> : <><strong>还缺少</strong>{formatMissingConfigItems(config.missing).map((item) => <span key={item}>{item}</span>)}</>}
          </div>
        </>
      )}
    </div>
  );
}

function LlmConfigPage({
  config,
  onSave,
  loading
}: {
  config: LlmConfigStatus | null;
  onSave: (payload: Record<string, string | number | boolean>) => void;
  loading: boolean;
}) {
  const [displayName, setDisplayName] = useState("阿里云百炼 Qwen3.7-Max");
  const [baseUrl, setBaseUrl] = useState("https://dashscope.aliyuncs.com/compatible-mode/v1");
  const [modelName, setModelName] = useState("qwen3.7-max");
  const [temperature, setTemperature] = useState(0);
  const [topP, setTopP] = useState(0.8);
  const [maxCompletionTokens, setMaxCompletionTokens] = useState(12000);
  const [enableThinking, setEnableThinking] = useState(false);

  useEffect(() => {
    if (!config) return;
    setDisplayName(config.displayName || "阿里云百炼 Qwen3.7-Max");
    setBaseUrl(config.baseUrl || "https://dashscope.aliyuncs.com/compatible-mode/v1");
    setModelName(config.modelName || "qwen3.7-max");
    setTemperature(Number(config.temperature ?? 0));
    setTopP(Number(config.topP ?? 0.8));
    setMaxCompletionTokens(Number(config.maxCompletionTokens ?? 12000));
    setEnableThinking(Boolean(config.enableThinking));
  }, [config]);

  function submit() {
    onSave({
      displayName,
      baseUrl,
      modelName,
      temperature,
      topP,
      maxCompletionTokens,
      enableThinking
    });
  }

  return (
    <section className="llmConfigGrid">
      <div className="panel full llmHeroPanel">
        <div className="sectionTitle">
          <h2>千问大模型配置</h2>
          <span>绑定后用于事实层抽取：ASR/人工修正文本文本 → 千问抽取事实包。</span>
        </div>
        {!config ? (
          <StatusChip label="读取中" tone="gray" />
        ) : (
          <div className="statusRow">
            <StatusChip label={config.configured ? "已绑定" : "未完整配置"} tone={config.configured ? "teal" : "amber"} />
            <StatusChip label={config.modelName || "未设置模型"} tone="blue" />
            <StatusChip label={config.apiKeySet ? "API Key 已保存" : "API Key 未保存"} tone={config.apiKeySet ? "teal" : "amber"} />
            <StatusChip label={config.factLayerEnabled && config.modelEnabled ? "事实层已启用" : "事实层未启用"} tone={config.factLayerEnabled && config.modelEnabled ? "teal" : "gray"} />
          </div>
        )}
      </div>

      <div className="panel llmFormPanel">
        <div className="sectionTitle">
          <h2>模型连接</h2>
          <span>兼容主流大模型对话接口。</span>
        </div>
        <div className="formGrid two">
          <label>
            显示名称
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="阿里云百炼 Qwen3.7-Max" />
          </label>
          <label>
            模型名称
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="qwen3.7-max" />
          </label>
        </div>
        <label>
          接口地址
          <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
        </label>
        <div className="logicNote">
          <strong>密钥安全：</strong>API Key 只能在服务端环境变量 <code>LLM_API_KEY</code> 中配置。页面不会读取、接收或回显密钥。
        </div>

        <div className="formGrid three">
          <label>
            随机性参数
            <input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(Number(event.target.value))} />
          </label>
          <label>
            采样范围
            <input type="number" min="0" max="1" step="0.05" value={topP} onChange={(event) => setTopP(Number(event.target.value))} />
          </label>
          <label>
            最大输出Token
            <input type="number" min="512" step="512" value={maxCompletionTokens} onChange={(event) => setMaxCompletionTokens(Number(event.target.value))} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={enableThinking} onChange={(event) => setEnableThinking(event.target.checked)} />
          启用思考模式
        </label>
        <button className="primary" onClick={submit} disabled={loading}>
          <Icon name="save" />
          保存并绑定到事实层
        </button>
      </div>

      <div className="panel llmHelpPanel">
        <div className="sectionTitle">
          <h2>绑定位置</h2>
          <span>这里配置的是事实层模型，不是 ASR。</span>
        </div>
        <div className="sourceMap">
          <div>
            <strong>输入</strong>
            <span>转写文本、角色、时间戳、人工修正版本</span>
          </div>
          <div>
            <strong>模型</strong>
            <span>千问只抽取客户画像、需求、异议、销售动作和证据</span>
          </div>
          <div>
            <strong>下游</strong>
            <span>SOP质检、策略匹配、生成卡片继续走配置规则</span>
          </div>
        </div>
        <div className="auditList">
          {config?.configured ? (
            <span>配置完整。下一次点击“重新分析/评分”会调用千问做事实层抽取。</span>
          ) : (
            <>
              <strong>还缺少</strong>
              {formatMissingConfigItems(config?.missing || ["LLM_API_KEY"]).map((item) => <span key={item}>{item}</span>)}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function WorkspacePage({
  detail,
  draft,
  setDraft,
  onSave,
  onMapSpeakerRoles,
  onAnalyze,
  onSaveFactEdits,
  onStartAsr,
  onPollAsr,
  onCreate,
  asrConfig,
  loading
}: {
  detail: SessionDetail | null;
  draft: TranscriptUtterance[];
  setDraft: React.Dispatch<React.SetStateAction<TranscriptUtterance[]>>;
  onSave: () => void;
  onMapSpeakerRoles: () => void;
  onAnalyze: () => void;
  onSaveFactEdits: (edits: FactEdit[]) => Promise<void>;
  onStartAsr: () => void;
  onPollAsr: () => void;
  onCreate: (payload: FormData | Record<string, unknown>) => void;
  asrConfig: AsrConfigStatus | null;
  loading: boolean;
}) {
  const [supplement, setSupplement] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [playerStatus, setPlayerStatus] = useState("");

  if (!detail) {
    return <EmptyState title="还没有接待记录" text="请先在接待会话中心上传ASR文本或录音。" />;
  }

  const audioSrc = detail.session.audioPath ? `/api/sessions/${detail.session.id}/audio` : "";

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      if (audio.paused) {
        await audio.play();
        setIsPlaying(true);
        setPlayerStatus("正在播放录音");
      } else {
        audio.pause();
        setIsPlaying(false);
        setPlayerStatus("已暂停");
      }
    } catch (error) {
      setPlayerStatus(error instanceof Error ? `播放失败：${error.message}` : "播放失败");
    }
  }

  function skipSilence() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = draft.find((item) => item.startSec > audio.currentTime + 0.5);
    if (next) {
      audio.currentTime = Math.max(0, next.startSec);
      setPlayerStatus(`已跳到 ${formatTime(next.startSec)} 的下一句`);
    } else {
      setPlayerStatus("已经到最后一句附近");
    }
  }

  function toggleLoop() {
    const audio = audioRef.current;
    if (!audio) return;
    const next = !isLooping;
    audio.loop = next;
    setIsLooping(next);
    setPlayerStatus(next ? "已开启整段循环" : "已关闭循环");
  }

  if (!draft.length) {
    return (
      <div className="panel">
        <div className="sectionTitle">
          <h2>待转写/可补充文本</h2>
          <span>该录音任务没有ASR文本，因此不会生成虚假质检结果。</span>
        </div>
        <div className="asrStatusBox">
          <StatusChip label={formatStatusText(detail.session.asrStatus)} tone={detail.session.asrStatus.includes("完成") ? "teal" : detail.session.asrStatus.includes("失败") || detail.session.asrStatus.includes("缺") || detail.session.asrStatus.includes("配置") ? "amber" : "blue"} />
          {detail.session.asrTaskId && <span>任务ID：{detail.session.asrTaskId}</span>}
          {detail.session.asrError && <small>{detail.session.asrError}</small>}
          {asrConfig && !asrConfig.configured && <small>请先补齐 .env：{asrConfig.missing.join("、")}</small>}
          {detail.session.asrStatus.includes("额度不足") && <small>处理方式：在阿里云补充录音文件识别时长额度，或更换有额度的 NLS AppKey；原型测试可先粘贴人工转写文本继续跑质检和客户洞察。</small>}
        </div>
        <div className="buttonRow asrButtons">
          <button className="primary" onClick={onStartAsr} disabled={loading || !detail.session.audioPath}>
            <Icon name="audio" />
            提交阿里ASR
          </button>
          <button onClick={onPollAsr} disabled={loading || !detail.session.asrTaskId}>
            <Icon name="repeat" />
            查询转写结果
          </button>
        </div>
        <label className="textareaLabel">
          人工补充转写文本
          <textarea
            value={supplement}
            onChange={(event) => setSupplement(event.target.value)}
            rows={10}
            placeholder="只有 ASR 暂未完成或失败时，才需要在这里粘贴人工转写文本。ASR完成后会自动显示在下方“转写与角色修正”列表。"
          />
        </label>
        <button
          className="primary"
          disabled={!supplement.trim()}
          onClick={() =>
            onCreate({
              store: detail.session.store,
              salesperson: detail.session.salesperson,
              customerName: detail.session.customer_name,
              asrText: supplement
            })
          }
        >
          用补充文本创建可分析接待
        </button>
      </div>
    );
  }

  return (
    <section className="workspaceGrid">
      <div className="panel sessionSummary workspaceAudioHeader">
        <div className="audioHeaderMeta">
          <div>
            <h2>{detail.session.reception_no}</h2>
            <div className="summaryLine">
              <span>{detail.session.store}</span>
              <span>{detail.session.salesperson}</span>
              <span>{detail.session.customer_name}</span>
            </div>
            <div className="statusRow">
              <StatusChip label={detail.session.activeVersion.startsWith("human") ? "人工修正版本" : "AI原始版本"} tone="teal" />
              <StatusChip label={formatStatusText(detail.session.analysisStatus)} tone="blue" />
              <StatusChip label={formatStatusText(detail.session.qualityStatus)} tone="gray" />
              <StatusChip label={detail.session.transcriptSource || "来源未知"} tone="gray" />
            </div>
          </div>
          <div className="audioSourceSummary">
            <strong>{audioSrc ? "录音与音轨" : "当前接待无录音文件"}</strong>
            <span>
              {audioSrc
                ? `当前转写共 ${draft.length} 句，可播放录音核对时间戳和角色。`
                : `该接待由${detail.session.transcriptSource || "文本"}创建，原始数据共 ${draft.length} 句，并非页面截断。`}
            </span>
          </div>
        </div>
        {audioSrc && (
          <audio
            ref={audioRef}
            src={audioSrc}
            controls
            className="audioPlayer"
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            onError={() => setPlayerStatus("录音加载失败，请确认上传文件仍存在。")}
          />
        )}
        {audioSrc ? (
          <div className="audioTrackRow">
            <div className="waveform" aria-label="录音音轨示意">
              {Array.from({ length: 96 }).map((_, index) => (
                <i key={index} style={{ height: `${18 + ((index * 17) % 50)}px` }} />
              ))}
            </div>
            <div className="playerControls">
              <button onClick={togglePlay}><Icon name={isPlaying ? "pause" : "play"} />{isPlaying ? "暂停" : "播放"}</button>
              <button onClick={skipSilence}><Icon name="skip" />跳到下一句</button>
              <button onClick={toggleLoop} className={isLooping ? "activeControl" : ""}><Icon name="repeat" />{isLooping ? "停止循环" : "循环录音"}</button>
            </div>
          </div>
        ) : (
          <div className="noAudioNotice">当前记录没有关联录音，无法播放音轨；可继续修正文本并运行事实抽取。</div>
        )}
        {playerStatus && <small className="playerStatus">{playerStatus}</small>}
      </div>

      <RoleProcessingFlow draft={draft} />

      <TranscriptEditor draft={draft} setDraft={setDraft} onMapSpeakerRoles={onMapSpeakerRoles} loading={loading} />

      <WorkspaceFactPanel analysis={detail.analysis} transcriptCount={draft.length} onSaveFactEdits={onSaveFactEdits} loading={loading} />

      <div className="workspaceRightRail">
        <LayerChain analysis={detail.analysis} />
        <div className="panel actionRail">
          <div className="sectionTitle">
            <h2>审核与流转</h2>
            <span>修正后重新运行质检和客户洞察。</span>
          </div>
          <button onClick={onSave} disabled={loading} className="primary">
            <Icon name="save" />
            保存人工修正版本
          </button>
          <button onClick={onAnalyze} disabled={loading}>
            <Icon name="spark" />
            重新分析/重新评分
          </button>
          <div className="auditList">
            <strong>后处理能力</strong>
            <span>改文本、改角色、拆句、合句</span>
            <span>插入漏转句、标记无效片段</span>
            <span>保留AI原始版本和人工修正版本</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkspaceFactPanel({
  analysis,
  transcriptCount,
  onSaveFactEdits,
  loading
}: {
  analysis: Analysis | null;
  transcriptCount: number;
  onSaveFactEdits: (edits: FactEdit[]) => Promise<void>;
  loading: boolean;
}) {
  if (!analysis) {
    return (
      <div className="panel workspaceFactPanel">
        <div className="sectionTitle">
          <h2>事实实体抽取</h2>
          <span>中间结果</span>
        </div>
        <EmptyState title="等待事实抽取" text={`当前已有 ${transcriptCount} 句转写。保存修正后点击重新分析/评分。`} />
      </div>
    );
  }

  const fact = analysis.factPackage || {};
  const rows: DecisionFactRow[] = Array.isArray(fact.decisionFactTable) ? fact.decisionFactTable : [];

  return (
    <div className="panel workspaceFactPanel">
      <div className="sectionTitle stickyTitle">
        <h2>标准事实数据表</h2>
        <span>{rows.length} 项事实。人工调整后自动重算全部下游，不再次调用大模型。</span>
      </div>
      <FactTableEditor rows={rows} analysis={analysis} onSave={onSaveFactEdits} loading={loading} />
    </div>
  );
}

function FactTableEditor({
  rows,
  analysis,
  onSave,
  loading
}: {
  rows: DecisionFactRow[];
  analysis: Analysis;
  onSave: (edits: FactEdit[]) => Promise<void>;
  loading: boolean;
}) {
  const [draftRows, setDraftRows] = useState<DecisionFactRow[]>(rows);
  useEffect(() => setDraftRows(rows), [rows]);

  const changed = useMemo(() => {
    const original = new Map(rows.map((row) => [row.factCode, row]));
    return draftRows.filter((row) => {
      const before = original.get(row.factCode);
      return before && (before.value !== row.value || before.status !== row.status);
    });
  }, [draftRows, rows]);

  function update(code: string, patch: Partial<DecisionFactRow>) {
    setDraftRows((current) => current.map((row) => row.factCode === code ? { ...row, ...patch } : row));
  }

  const customerRows = draftRows.filter((row) => row.category === "客户事实");
  const salesRows = draftRows.filter((row) => row.category === "销售行为事实");
  const layerSteps = [
    ["事实标准化", `${draftRows.length}项`],
    ["洞察与SOP", `${customerRows.filter((row) => row.status !== "未明确").length}项客户事实 / ${salesRows.filter((row) => row.status === "已执行").length}项动作`],
    ["诊断规则", `${analysis.diagnoses.length}项问题`],
    ["策略匹配", `${analysis.strategies.length}项策略`],
    ["生成卡片", `${analysis.generatedCards.length}张卡片`]
  ];

  return (
    <>
      <div className="factLinkageFlow" aria-label="事实驱动联动链路">
        {layerSteps.map(([name, result], index) => (
          <React.Fragment key={name}>
            <div><strong>{name}</strong><span>{result}</span></div>
            {index < layerSteps.length - 1 ? <b>→</b> : null}
          </React.Fragment>
        ))}
      </div>
      <p className="factEditorNotice">唯一判断入口是下表。客户事实回答“客户说了什么”，销售行为回答“销售做了什么”；诊断只读取这张表，不重新猜测原文。</p>
      <div className="decisionFactTable">
        {draftRows.map((row) => {
          const isSales = row.category === "销售行为事实";
          const statusOptions = isSales ? ["已执行", "未执行"] : ["已明确", "部分明确", "未明确"];
          return (
            <article className={`decisionFactRow ${isSales ? "salesFactRow" : "customerFactRow"}`} key={row.factCode}>
              <div className="decisionFactHead">
                <div><strong>{row.fieldName}</strong><span>{row.category}</span></div>
                <select value={row.status} onChange={(event) => update(row.factCode, { status: event.target.value })}>
                  {statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              {isSales ? (
                <div className="factBooleanValue">规则值：{row.status === "已执行" ? "已识别到动作" : "未识别到动作"}</div>
              ) : (
                <textarea value={row.value} rows={2} onChange={(event) => update(row.factCode, { value: event.target.value })} />
              )}
              <div className="factUses"><span>影响：</span>{row.downstreamUses.join("、")}</div>
              {row.evidence?.length ? (
                <details>
                  <summary>查看原文证据（{row.evidence.length}条）</summary>
                  {row.evidence.slice(0, 3).map((item, index) => <blockquote key={`${row.factCode}-${index}`}>{item.timestamp} {formatChineseLabel(item.speaker)}：{item.quote}</blockquote>)}
                </details>
              ) : <small>当前没有绑定原文证据，修正结果需人工复核。</small>}
            </article>
          );
        })}
      </div>
      <div className="factSaveBar">
        <div><strong>{changed.length ? `已修改 ${changed.length} 项事实` : "事实表未修改"}</strong><span>保存后立即联动刷新，保留人工修正来源。</span></div>
        <button className="primary" disabled={!changed.length || loading} onClick={() => onSave(changed.map(({ factCode, value, status }) => ({ factCode, value, status })))}>
          <Icon name="save" />保存事实并重算下游
        </button>
      </div>
    </>
  );
}

function TranscriptEditor({
  draft,
  setDraft,
  onMapSpeakerRoles,
  loading
}: {
  draft: TranscriptUtterance[];
  setDraft: React.Dispatch<React.SetStateAction<TranscriptUtterance[]>>;
  onMapSpeakerRoles: () => void;
  loading: boolean;
}) {
  function update(id: string, patch: Partial<TranscriptUtterance>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...patch, status: patch.status || "人工修正" } : item)));
  }

  function split(item: TranscriptUtterance) {
    const cut = findSplitPoint(item.text);
    const first = item.text.slice(0, cut).trim();
    const second = item.text.slice(cut).replace(/^，|。|、/, "").trim();
    if (!first || !second) return;
    setDraft((items) =>
      items.flatMap((row) =>
        row.id === item.id
          ? [
              { ...row, text: first, endSec: Math.max(row.startSec + 1, Math.floor((row.startSec + row.endSec) / 2)), status: "人工修正", issueType: "拆句错误" },
              {
                ...row,
                id: `local_${Date.now()}`,
                text: second,
                startSec: Math.floor((row.startSec + row.endSec) / 2),
                role: row.role === "销售" ? "主客户" : "销售",
                status: "人工修正",
                issueType: "跨角色串话"
              }
            ]
          : [row]
      )
    );
  }

  function merge(index: number) {
    if (index <= 0) return;
    setDraft((items) => {
      const prev = items[index - 1];
      const current = items[index];
      const rest = items.filter((_, i) => i !== index && i !== index - 1);
      return [
        ...rest.slice(0, index - 1),
        {
        ...prev,
        text: `${prev.text}${prev.text.endsWith("。") ? "" : "。"}${current.text}`,
        endSec: current.endSec,
        status: "人工修正",
        issueType: "合句错误"
        },
        ...rest.slice(index - 1)
      ];
    });
  }

  function insertAfter(index: number) {
    setDraft((items) => {
      const base = items[index];
      const inserted: TranscriptUtterance = {
        ...base,
        id: `local_${Date.now()}`,
        index: index + 1,
        startSec: base.endSec,
        endSec: base.endSec + 3,
        role: "销售",
        text: "请在这里补充漏转句",
        included: true,
        status: "人工修正",
        issueType: "漏转"
      };
      return [...items.slice(0, index + 1), inserted, ...items.slice(index + 1)];
    });
  }

  return (
    <div className="panel transcriptPanel">
      <div className="sectionTitle stickyTitle">
        <h2>转写与角色修正</h2>
        <span>共 {draft.length} 句。每句可改角色、文本、质检参与状态和问题类型。</span>
      </div>
      <div className="buttonRow transcriptQuickTools">
        <button onClick={onMapSpeakerRoles} disabled={loading}>
          <Icon name="spark" />
          大模型标定销售/客户
        </button>
      </div>
      <p className="notice">匿名角色先由本通录音声纹完成分离；大模型只读取整通话术，将匿名角色一次性标定为销售和客户。</p>
      <div className="utteranceList">
        {draft.map((item, index) => (
          <article key={item.id} className={`utterance ${item.included ? "" : "mutedUtterance"}`}>
            <div className="utteranceMeta">
              <span>{formatTime(item.startSec)}</span>
              <select value={item.role} onChange={(event) => update(item.id, { role: event.target.value })}>
                {Array.from(new Set([item.role, "销售", "主客户", "陪同人", "同事", "店长", "电话对方", "未知"].filter(Boolean))).map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={item.included} onChange={(event) => update(item.id, { included: event.target.checked })} />
                参与质检
              </label>
            </div>
            <textarea value={item.text} onChange={(event) => update(item.id, { text: event.target.value })} rows={2} />
            <div className="utteranceTools">
              <button onClick={() => split(item)}>拆句</button>
              <button onClick={() => merge(index)}>合并上一句</button>
              <button onClick={() => insertAfter(index)}>插入漏句</button>
              <select value={item.issueType || ""} onChange={(event) => update(item.id, { issueType: event.target.value })}>
                <option value="">无问题</option>
                <option>ASR错字</option>
                <option>漏转</option>
                <option>角色错误</option>
                <option>拆句错误</option>
                <option>合句错误</option>
                <option>跨角色串话</option>
                <option>角色待复核</option>
                <option>无关片段</option>
              </select>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function RoleProcessingFlow({ draft }: { draft: TranscriptUtterance[] }) {
  const anonymousSpeakers = new Set(draft.filter((item) => /^说话人\d+$/.test(item.role)).map((item) => item.role));
  const mappedRoles = new Set(draft.map((item) => item.role));
  const mapped = mappedRoles.has("销售") && mappedRoles.has("主客户");
  return (
    <div className="panel roleProcessingFlow">
      <div className="roleFlowStep">
        <strong>1. ASR匿名角色初分</strong>
        <span>{anonymousSpeakers.size >= 2 ? `已得到 ${anonymousSpeakers.size} 个匿名说话人` : "等待至少两个说话人编号"}</span>
      </div>
      <b>→</b>
      <div className="roleFlowStep">
        <strong>2. 本通录音声纹精修</strong>
        <span>只在当前录音内聚类，短句和重叠片段需声纹模型二次处理</span>
      </div>
      <b>→</b>
      <div className="roleFlowStep">
        <strong>3. 大模型语义标定</strong>
        <span>{mapped ? "已映射为销售/主客户，等待人工复核" : "等待整通话术角色映射"}</span>
      </div>
      <b>→</b>
      <div className="roleFlowStep">
        <strong>4. 事实层分析</strong>
        <span>角色确认后再抽取事实、执行质检和客户洞察</span>
      </div>
    </div>
  );
}

function LayerChain({ analysis }: { analysis: Analysis | null }) {
  const layers = analysis
    ? [
        { name: "事实层", text: `${analysis.factPackage.evidence.length} 条证据，${analysis.factPackage.customerTags.objections.length} 类异议`, tone: "blue" },
        { name: "诊断层", text: `${analysis.diagnoses.length} 条诊断，规则引擎评分 ${analysis.score}`, tone: "amber" },
        { name: "策略层", text: `${analysis.strategies.length} 个策略，按风险和可挽回排序`, tone: "teal" },
        { name: "生成层", text: `${analysis.generatedCards.length} 张业务卡片，模板生成为主`, tone: "blue" },
        { name: "反馈层", text: "销售采纳、店长审核、运营修正规则", tone: "gray" }
      ]
    : [
        { name: "事实层", text: "等待分析生成结构化对话事实包", tone: "gray" },
        { name: "诊断层", text: "等待规则命中", tone: "gray" },
        { name: "策略层", text: "等待策略表匹配", tone: "gray" },
        { name: "生成层", text: "等待生成行动卡片", tone: "gray" },
        { name: "反馈层", text: "等待销售/店长/运营反馈", tone: "gray" }
      ];

  return (
    <div className="panel layerPanel">
      <div className="sectionTitle">
        <h2>分层分析链路</h2>
        <span>一次洞察，多层复用。</span>
      </div>
      <div className="layerChain">
        {layers.map((item) => (
          <div key={item.name} className={`layerItem ${item.tone}`}>
            <strong>{item.name}</strong>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function InsightsPage({
  detail,
  onFeedback
}: {
  detail: SessionDetail | null;
  onFeedback: (action: string, target?: string, actorType?: string) => void;
}) {
  if (!detail) return <EmptyState title="未选择接待" text="请先选择一条接待记录。" />;
  if (!detail.analysis) return <EmptyState title="尚未分析" text="请在单次接待工作台点击重新分析/评分。" />;

  const fact = detail.analysis.factPackage;
  const exportQuery = `sessionId=${encodeURIComponent(detail.session.id)}`;
  return (
    <section className="insightGrid">
      <div className="panel scorePanel">
        <div className="scorePanelHead">
          <span>本次质检分</span>
          <div className="exportActions">
            <a href={`/api/exports/quality.csv?${exportQuery}`} download>
              <Icon name="save" />
              导出质检
            </a>
            <a href={`/api/exports/insights.csv?${exportQuery}`} download>
              <Icon name="save" />
              导出洞察
            </a>
          </div>
        </div>
        <strong>{detail.analysis.score}</strong>
        <p>会话结论：{fact.conversation.conclusion}</p>
        <div className="statusRow">
          <StatusChip label={fact.customerTags.intentLevel} tone="blue" />
          <StatusChip label={fact.customerTags.followUpValue} tone="teal" />
        </div>
      </div>

      <div className="panel customerPanel">
        <div className="sectionTitle">
          <h2>本次客户洞察</h2>
          <span>不是客户360，只代表本次接待。</span>
        </div>
        <KeyValue label="使用场景" value={fact.customerProfile.useCase} />
        <KeyValue label="预算信息" value={fact.customerProfile.budgetValue} />
        <KeyValue label="购买周期" value={fact.customerProfile.purchaseTimeline} />
        <KeyValue label="决策链" value={fact.customerProfile.decisionChainStatus} />
        <KeyValue label="竞品" value={fact.customerProfile.competitors.join("、") || "未提及"} />
        <KeyValue label="关注点" value={fact.customerTags.concerns.join("、")} />
      </div>

      <DerivedRuleResultsPanel fact={fact} />

      <FactExtractionPanel fact={fact} sessionId={detail.session.id} />

      <div className="panel">
        <div className="sectionTitle">
          <h2>诊断结果</h2>
          <span>规则命中，不重复调用完整大模型。</span>
        </div>
        <div className="diagnosisList">
          {detail.analysis.diagnoses.map((item) => (
            <article key={item.id} className="diagnosis">
              <div>
                <strong>{item.issue}</strong>
                <span>{item.category} · {item.reason || "规则命中"}</span>
              </div>
              <StatusChip label={item.riskLevel} tone={item.riskLevel.includes("高") ? "amber" : "blue"} />
              {item.manualReviewRequired && <StatusChip label="需人工复核" tone="amber" />}
              <EvidenceList evidence={item.evidence} emptyText="该诊断由规则缺失命中，暂无直接原文证据。" />
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>生成卡片</h2>
          <span>销售、店长、运营可直接处理。</span>
        </div>
        <div className="cardList">
          {detail.analysis.generatedCards.map((card) => (
            <article key={card.id} className="generatedCard">
              <div className="cardHead">
                <span>{card.type}</span>
                <StatusChip label={card.status} tone="gray" />
              </div>
              <h3>{card.title}</h3>
              <p>{card.content}</p>
              {card.managerAlert?.required && <div className="managerAlertBanner"><strong>店长介入预警</strong><span>渠道：{card.managerAlert.channel || "店长微信"}</span><span>状态：{card.managerAlert.status}</span></div>}
              <EvidenceList evidence={card.evidence} emptyText="该卡片暂无可展示原文证据，需人工确认后再使用。" />
              <div className="buttonRow">
                {card.actions.map((action) => (
                  <button key={action} onClick={() => onFeedback(action, card.id, action.includes("话术") ? "manager" : "sales")}>
                    {action}
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      <SopEvidencePanel fact={fact} />

      <OriginalDialoguePanel transcript={detail.transcript} />
    </section>
  );
}

function SopEvidencePanel({ fact }: { fact: any }) {
  const actions = Object.entries(fact.sopActions || {});
  const [selectedKey, setSelectedKey] = useState(actions[0]?.[0] || "");

  useEffect(() => {
    if (!actions.some(([key]) => key === selectedKey)) setSelectedKey(actions[0]?.[0] || "");
  }, [fact.sopActions, selectedKey]);

  const selectedEntry = actions.find(([key]) => key === selectedKey) || actions[0];
  const selectedDone = Boolean(selectedEntry?.[1]);
  const selectedEvidence = selectedEntry ? getSopActionEvidence(fact, selectedEntry[0], selectedDone) : [];

  return (
    <div className="panel full">
      <div className="sectionTitle">
        <h2>SOP动作与证据</h2>
        <span>点击动作查看本项判断结果和对应原文证据。</span>
      </div>
      <div className="sopGrid" role="tablist" aria-label="SOP动作筛选">
        {actions.map(([key, value]) => {
          const done = Boolean(value);
          const selected = key === selectedEntry?.[0];
          return (
            <button
              type="button"
              role="tab"
              aria-selected={selected}
              key={key}
              className={`sopFilter ${done ? "sopDone" : "sopMiss"} ${selected ? "sopSelected" : ""}`}
              onClick={() => setSelectedKey(key)}
            >
              <Icon name={done ? "check" : "alert"} />
              <span>{sopLabel(key)}</span>
            </button>
          );
        })}
      </div>
      {selectedEntry && (
        <article className="sopSelectionResult">
          <div>
            <strong>{sopLabel(selectedEntry[0])}</strong>
            <StatusChip label={selectedDone ? "已完成" : "未完成"} tone={selectedDone ? "teal" : "amber"} />
          </div>
          <p>{selectedDone
            ? `事实层已识别到销售完成“${sopLabel(selectedEntry[0])}”的动作。`
            : `事实层未找到销售完成“${sopLabel(selectedEntry[0])}”的明确原文证据。`}</p>
          <span>{selectedEvidence.length ? `已找到 ${selectedEvidence.length} 条相关证据` : "暂无可展示的完成证据"}</span>
        </article>
      )}
      <div className="evidenceGrid">
        <EvidenceList
          evidence={selectedEvidence}
          emptyText={selectedDone ? "该动作已判断为完成，但当前没有可展示的原文证据，请人工复核。" : "该动作未完成，因此不使用无关对话作为完成证据。"}
        />
      </div>
    </div>
  );
}

function getSopActionEvidence(fact: any, actionKey: string, completed: boolean): Evidence[] {
  if (!completed) return [];
  const evidence = normalizeEvidenceList(fact.evidence);
  const patterns: Record<string, RegExp> = {
    greeted_customer: /问候|开场|您好|你好|欢迎/,
    asked_use_case: /使用场景|用途|家用|通勤|商务|平时.*用|主要.*用/,
    asked_budget: /价格|预算|首付|月供|优惠|落地价/,
    asked_purchase_timeline: /购买周期|购车周期|提车|近期|今天|本周|月底|时间/,
    asked_decision_maker: /决策|家人|老婆|老公|商量|领导/,
    introduced_product_by_need: /需求|关注点|产品讲解|销售讲解|配置|空间|安全|外观|动力|智能/,
    invited_test_drive: /体验|试驾/,
    quoted_price: /价格|预算|报价|优惠|首付|月供|落地价/,
    handled_objection: /异议|回应动作|客户反应|产品配置|竞品|库存|交付/,
    confirmed_next_followup: /跟进|下一步|联系|微信|电话|复店|发送资料/
  };
  const pattern = patterns[actionKey];
  if (!pattern) return [];
  return evidence.filter((item) => pattern.test(`${item.type || ""} ${item.quote || ""}`)).slice(0, 12);
}

function DerivedRuleResultsPanel({ fact }: { fact: any }) {
  const result = fact.derivedResults || {};
  const rows = [
    ["需求挖掘质量", result.needDiscoveryQuality],
    ["产品讲解匹配度", result.productExplanationMatch],
    ["异议强度", result.objectionStrength],
    ["异议处理情况", result.objectionHandling],
    ["成交推进动作", result.closingActions],
    ["跟进闭环", result.followUpClosure],
    ["销售亮点", Array.isArray(result.salesStrengths) ? result.salesStrengths.join("、") : result.salesStrengths],
    ["销售不足", Array.isArray(result.salesWeaknesses) ? result.salesWeaknesses.join("、") : result.salesWeaknesses],
    ["是否可跟进", result.followUpValue],
    ["意向等级", result.intentLevel]
  ];
  return (
    <div className="panel full">
      <div className="sectionTitle">
        <h2>规则计算结果</h2>
        <span>千问只抽取判断依据；以下10项由诊断规则和标签规则生成。</span>
      </div>
      <div className="factFieldGrid">
        {rows.map(([label, value]) => (
          <article className="factField" key={label}>
            <div className="factFieldHead"><strong>{label}</strong><StatusChip label="规则生成" tone="teal" /></div>
            <p>{value || "信息不足"}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

type FactExtractionItem = {
  key?: string;
  category?: string;
  field?: string;
  meaning?: string;
  modelPrompt?: string;
  outputRequirement?: string;
  value?: unknown;
  extractionStatus?: string;
  evidence?: Evidence[];
};

function FactExtractionPanel({ fact, sessionId }: { fact: any; sessionId: string }) {
  const extracted: FactExtractionItem[] = Array.isArray(fact.extractedFacts) ? fact.extractedFacts : [];
  const grouped = extracted.reduce((acc: Record<string, FactExtractionItem[]>, item: FactExtractionItem) => {
            const key = formatChineseLabel(item.category || "未分组");
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <div className="panel full factPanel">
      <div className="sectionTitle">
        <h2>事实层实体抽取</h2>
        <div className="factPanelMeta">
          <span>{fact.factExtractionMeta?.schemaSource || "配置字段"} · {extracted.length} 个字段 · 输出可回溯证据</span>
          <a className="factDownload" href={`/api/exports/facts.csv?sessionId=${encodeURIComponent(sessionId)}`} download>
            <Icon name="save" />
            下载事实层结果
          </a>
        </div>
      </div>
      <div className="factGroupList">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="factGroup">
            <h3>{category}</h3>
            <div className="factFieldGrid">
              {items.map((item) => {
                const evidence = getFactEvidence(item);
                const valueRows = formatFactEntries(item.value);
                return (
                  <article key={item.key || item.field} className="factField">
                    <div className="factFieldHead">
                      <strong>{displayFactFieldName(item)}</strong>
                      <StatusChip label={evidence.length ? "已提取" : "无明确证据"} tone={evidence.length ? "teal" : "gray"} />
                    </div>
                    <div className="factValueList">
                      {valueRows.map((row, index) => (
                        <div className="factValueRow" key={`${row.label}-${index}`}>
                          <strong>{row.label}</strong>
                          <span>{row.value}</span>
                        </div>
                      ))}
                    </div>
                    <EvidenceList evidence={evidence} emptyText="该字段无明确原文证据。" />
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function EvidenceList({ evidence, emptyText }: { evidence?: Evidence[]; emptyText: string }) {
  const normalizedEvidence = normalizeEvidenceList(evidence);
  if (!normalizedEvidence.length) return <small className="emptyEvidence">{emptyText}</small>;
  return (
    <div className="evidenceList">
      {normalizedEvidence.map((item, index) => (
        <blockquote key={`${item.timestamp || "no-time"}-${index}`}>
          <strong>{formatChineseLabel(item.type || "原文证据")}</strong>
          {item.timestamp} {formatChineseLabel(item.speaker || "原文")}：{item.quote}
        </blockquote>
      ))}
    </div>
  );
}

function OriginalDialoguePanel({ transcript }: { transcript: TranscriptUtterance[] }) {
  return (
    <div className="panel full dialoguePanel">
      <div className="sectionTitle">
        <h2>原文对话全文</h2>
        <span>当前分析版本，共 {transcript.length} 句，可用于核对质检和洞察证据。</span>
      </div>
      <div className="dialogueList">
        {transcript.map((item) => (
          <div key={item.id} className={item.included ? "dialogueLine" : "dialogueLine excluded"}>
            <span>{formatTime(item.startSec)}</span>
            <strong>{formatChineseLabel(item.role)}</strong>
            <p>{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const factKeyLabels: Record<string, string> = {
  customer_need_facts: "客户需求事实",
  content: "事实内容",
  sales_question_actions: "销售询问动作",
  sales_question: "销售提问",
  customer_answer: "客户回答",
  customer_statement: "客户表达",
  response_action: "销售回应动作",
  positive_behavior: "正向销售行为",
  sales_action: "销售动作",
  communication_status: "沟通状态",
  communication_willingness: "沟通意愿",
  delay_signal: "延迟决策信号",
  engagement_signal: "互动意愿信号",
  need_signal: "需求信号",
  next_step_statement: "下一步表达",
  sop_greeting_and_ask: "问候与需求询问",
  sop_handle_objection: "异议回应",
  sop_objection_response: "异议回应证据",
  sop_action: "SOP动作",
  sop_evidence_greeting_inquiry: "问候与需求询问证据",
  sop_evidence_price_action: "报价动作证据",
  signal_real_need: "真实需求信号",
  signal_willing_to_communicate_but_pending: "愿意沟通但尚待决定",
  purchase_signal: "购买信号",
  blocking_signal: "阻塞信号",
  greeted_customer: "问候客户",
  customer_requirements: "客户需求与关注点",
  sales_explanations: "销售讲解事实",
  requirement_explanation_pairs: "需求与讲解对应关系",
  requirement: "客户需求",
  explanation: "讲解内容",
  objections: "客户异议事实",
  expression: "异议原话",
  occurrence_count: "出现次数",
  explicit_refusal: "是否明确拒绝",
  explicitRefusal: "是否明确拒绝",
  blocked_actions: "阻碍的推进动作",
  blockedActions: "阻碍的推进动作",
  block_type: "阻塞类型",
  action_type: "动作类型",
  objection_responses: "异议与销售回应",
  objection_type: "异议类型",
  objection: "客户异议",
  response_actions: "销售回应动作",
  responseActions: "销售回应动作",
  handling_result: "处理结果",
  objection_response: "异议回应",
  objection_handling_attempt: "异议处理尝试",
  customer_reaction: "客户反应",
  completed_actions: "已发生推进动作",
  customer_reactions: "客户回应",
  scene_types: "业务场景",
  products_discussed: "讨论的产品",
  decision_expressions: "决策相关表达",
  customer_answers: "客户回答",
  follow_up_offer: "跟进提议",
  customer_response: "客户回应",
  next_step_action: "下一步动作",
  nextStepAction: "下一步动作",
  owner: "执行人",
  channel: "联系渠道",
  goal: "跟进目标",
  customer_agreement: "客户是否同意",
  customerAgreement: "客户是否同意",
  positive_behavior_candidates: "候选正向行为",
  behavior: "销售行为",
  result: "对话结果",
  observed_sop_actions: "已观察到的SOP动作",
  greeting_and_inquiry: "问候与需求询问",
  ask_usage: "询问用途",
  ask_budget: "询问预算",
  ask_timeline: "询问购买时间",
  ask_decision_maker: "询问决策人",
  explain_product: "产品讲解",
  product_explanation: "产品讲解",
  product_presentation: "产品介绍",
  test_drive: "试驾",
  test_drive_invitation: "试驾邀约",
  price_quotation: "报价",
  quote_price: "报价",
  confirm_followup: "确认跟进",
  follow_up_confirmation: "跟进确认",
  handle_objection: "异议处理",
  follow_up_signals: "跟进相关事实信号",
  has_real_need: "是否有真实需求",
  real_need: "真实需求",
  willing_to_communicate: "是否愿意继续沟通",
  left_contact_info: "是否已留联系方式",
  provided_contact_info: "是否已留联系方式",
  agreed_next_step: "是否约定下一步",
  explicit_rejection: "是否明确拒绝",
  request_stop_contact: "是否要求停止联系",
  requested_stop_contact: "是否要求停止联系",
  invalid_reception: "是否为无效接待",
  purchase_signals: "正向购买信号",
  needs_analysis: "需求分析",
  question_type: "问题类型",
  signal_type: "信号类型",
  blocking_signals: "阻塞信号",
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
  intentLevel: "意向等级",
  purchaseStage: "购买阶段",
  followUpValue: "跟进价值",
  priceSensitivity: "价格敏感度",
  urgencyLevel: "紧迫程度",
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
  value: "抽取值",
  text: "原文",
  role: "说话角色",
  time: "时间",
  customer_question: "客户问题",
  sales_quote: "销售原话",
  description: "情况说明",
  customerObjection: "客户异议",
  customerReaction: "客户反应",
  riskType: "风险类型",
  risk_segments: "风险片段",
  speaker: "说话人",
  quote: "原文",
  timestamp: "时间戳",
  type: "证据类型"
};

const factValueLabels: Record<string, string> = {
  explicit: "明确表达",
  inferred: "基于原文推断",
  "explicit/inferred": "明确表达或强相关推断",
  "explicit_or_inferred": "明确表达或强相关推断",
  sales: "销售",
  customer: "客户",
  assistant: "销售",
  user: "客户",
  true: "是",
  false: "否",
  completed: "已完成",
  missing: "未完成",
  unknown: "未明确"
};

const hiddenFactKeys = new Set(["evidence", "confidence", "置信度", "owner", "next_step_action", "nextStepAction", "goal", "sales_stage"]);

function formatFactEntries(value: unknown): Array<{ label: string; value: string }> {
  if (value == null || value === "") return [{ label: "抽取结果", value: "未提取" }];
  if (typeof value !== "object") return [{ label: "抽取结果", value: String(value) }];
  if (Array.isArray(value)) {
    return value.length ? value.map((item, index) => ({ label: `结果${index + 1}`, value: stringifyFactValue(item) })) : [{ label: "抽取结果", value: "未提及" }];
  }

  const rows = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !hiddenFactKeys.has(key))
    .map(([key, item]) => ({
      label: factKeyLabels[key] || humanizeFactKey(key),
      value: stringifyFactValue(item)
    }))
    .filter((row) => row.value !== "");
  return rows.length ? rows : [{ label: "抽取结果", value: "未提及" }];
}

function stringifyFactValue(value: unknown): string {
  if (value == null || value === "") return "未提及";
  if (Array.isArray(value)) return value.length ? value.map((item) => stringifyFactValue(item)).join("、") : "未提及";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !hiddenFactKeys.has(key))
      .map(([key, item]) => `${factKeyLabels[key] || humanizeFactKey(key)}：${stringifyFactValue(item)}`)
      .join("；");
  }
  if (typeof value === "boolean") return value ? "是" : "否";
  const text = String(value);
  if (factValueLabels[text] || factKeyLabels[text]) return factValueLabels[text] || factKeyLabels[text];
  if (/^[a-z][A-Za-z0-9_-]*$/.test(text)) return "其他信息";
  return text;
}

function humanizeFactKey(key: string) {
  if (!key) return "未命名字段";
  const mapped = factKeyLabels[key] || factValueLabels[key];
  if (mapped) return mapped;
  if (/^[A-Za-z0-9_-]+$/.test(key)) return "扩展信息";
  return key;
}

function formatRequirementLabels(value?: string) {
  if (!value) return "";
  return value
    .replace(/[A-Za-z][A-Za-z0-9_-]*/g, (key) => factKeyLabels[key] || factValueLabels[key] || "扩展信息")
    .replace(/\[\]/g, "（多项）")
    .replace(/\{\}/g, "（结构化内容）")
    .replace(/[,，]+/g, "、")
    .replace(/\s*、\s*/g, "、");
}

function isInternalCustomerTagGroup(value: string) {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value);
}

function formatCustomerTagGroupLabel(value: string) {
  const labels: Record<string, string> = {
    intentLevel: "意向等级",
    purchaseStage: "购买阶段",
    objections: "异议类型",
    concerns: "客户关注点",
    followUpValue: "跟进价值",
    priceSensitivity: "价格敏感度",
    urgencyLevel: "购买紧迫度"
  };
  return labels[value] || factKeyLabels[value] || formatChineseLabel(value) || "客户标签组";
}

function displayFactFieldName(item: FactExtractionItem) {
  return formatChineseLabel(item.field || item.key || "未命名字段");
}

function formatProviderLabel(provider?: string) {
  const map: Record<string, string> = {
    "openai-compatible": "兼容接口调用",
    "poc-local": "内置抽取器",
    aliyun: "阿里云",
    funasr: "FunASR",
    none: "未启用"
  };
  return map[String(provider || "")] || "模型提供方未配置";
}

function formatMissingConfigItems(items?: string[]) {
  const map: Record<string, string> = {
    LLM_API_KEY: "大模型API Key",
    LLM_MODEL: "大模型名称",
    LLM_BASE_URL: "大模型接口地址",
    ASR_PROVIDER: "ASR服务类型",
    ASR_PROVIDER_NONE: "ASR服务类型",
    ALIYUN_ACCESS_KEY_ID: "阿里云AccessKey ID",
    ALIYUN_ACCESS_KEY_SECRET: "阿里云AccessKey Secret",
    ALIYUN_ASR_APP_KEY: "阿里云ASR AppKey",
    ALIYUN_PUBLIC_BASE_URL: "公网音频URL基座",
    FUNASR_ENDPOINT: "FunASR服务地址"
  };
  return (items || []).map((item) => map[item] || item.replace(/_/g, " "));
}

function formatStatusText(value?: string) {
  let text = String(value || "").trim();
  if (!text) return "未明确";
  text = text
    .replace(/This http method is not supported\./gi, "当前ASR接口不支持该请求方式，请检查阿里云服务类型或公网音频地址。")
    .replace(/USER_BIZDURATION_QUOTA_EXCEED/g, "阿里云录音识别额度不足")
    .replace(/StatusCode\s*41050001/g, "错误码41050001")
    .replace(/ASR_PROVIDER=aliyun/g, "ASR服务类型需选择阿里云")
    .replace(/ALIYUN_ACCESS_KEY_ID/g, "阿里云AccessKey ID")
    .replace(/ALIYUN_ACCESS_KEY_SECRET/g, "阿里云AccessKey Secret")
    .replace(/ALIYUN_NLS_APP_KEY|ALIYUN_ASR_APP_KEY/g, "阿里云ASR AppKey")
    .replace(/ALIYUN_ASR_PUBLIC_BASE_URL|ALIYUN_PUBLIC_BASE_URL/g, "公网音频URL基座")
    .replace(/OSS/g, "对象存储")
    .replace(/TaskId/g, "任务编号")
    .replace(/provider/g, "服务")
    .replace(/Model not exist\./gi, "模型不存在，请检查千问模型名称。");
  return text;
}

function formatModelEnvLabel(value?: string) {
  if (!value) return "模型环境变量未配置";
  return `模型环境变量：${value}`;
}

function formatPromptTemplateDisplay(value?: string) {
  if (!value) return "未配置";
  return value
    .replace(/\\n/g, "\n")
    .replace(/\{\{\s*transcript\s*\}\}/g, "{{转写文本}}")
    .replace(/\bvalue\b/g, "字段值");
}

function formatChineseLabel(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (factKeyLabels[text] || factValueLabels[text]) return factKeyLabels[text] || factValueLabels[text];
  if (/^(speaker|role|customer|sales|assistant|user)$/i.test(text)) return factValueLabels[text.toLowerCase()] || text;
  if (/[\u4e00-\u9fa5]/.test(text)) return text.replace(/_/g, "/");
  return text;
}

function formatConfigCodeLabel(value?: string) {
  const text = String(value || "").trim();
  if (!text) return "未命名配置项";
  const direct = factKeyLabels[text] || factValueLabels[text] || sopLabel(text);
  if (direct && direct !== text) return direct;
  const map: Record<string, string> = {
    followup: "跟进建议",
    loss: "败单归因",
    script: "优秀话术",
    risk: "风险提醒",
    price_followup: "价格异议跟进",
    competitor_followup: "竞品异议跟进",
    decision_followup: "决策链跟进",
    test_drive_followup: "试驾邀约跟进",
    quote_followup: "报价后跟进",
    closure_followup: "离店闭环修复",
    need_followup: "需求挖掘补齐",
    sales: "销售",
    manager: "店长",
    operation: "运营",
    operations: "运营",
    qa: "质检员",
    fact_field: "事实字段",
    generated_card: "生成卡片",
    diagnosis: "诊断问题",
    strategy: "策略建议",
    transcript: "转写文本",
    fact: "事实字段",
    transcript_correction: "转写人工修正",
    business_outcome: "业务结果"
  };
  if (map[text]) return map[text];
  if (/^card_custom_\d+$/.test(text)) return `自定义卡片${text.match(/\d+$/)?.[0] || ""}`;
  if (/^custom[-_]/.test(text)) return "自定义配置项";
  if (/^[A-Za-z0-9_-]+$/.test(text)) return "自定义配置项";
  return text;
}

function getFactEvidence(item: FactExtractionItem): Evidence[] {
  const direct = normalizeEvidenceList(item.evidence);
  if (direct.length) return direct;
  const nested = item.value && typeof item.value === "object" && !Array.isArray(item.value)
    ? (item.value as Record<string, unknown>).evidence
    : null;
  return normalizeEvidenceList(nested);
}

function normalizeEvidenceList(value: unknown): Evidence[] {
  if (!value) return [];
  if (typeof value === "string") return parseEvidenceText(value);
  if (Array.isArray(value)) return value.flatMap((item) => normalizeEvidenceList(item));
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const quote = String(record.quote || record.text || record.evidence || "").trim();
    if (!quote) return [];
    return [{
      timestamp: String(record.timestamp || record.time || ""),
      speaker: String(record.speaker || record.role || "原文"),
      quote,
      type: String(record.type || record.riskType || "原文证据")
    }];
  }
  return [];
}

function parseEvidenceText(text: string): Evidence[] {
  return text
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

function renderCompactValue(value: unknown) {
  if (value == null) return "未提及";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return truncateText(formatFactEntries(value).map((item) => `${item.label}：${item.value}`).join("；"), 80);
}

function FeedbackPage({ detail, metrics, onFeedback }: { detail: SessionDetail | null; metrics: Metrics | null; onFeedback: (action: string, target?: string, actorType?: string, details?: string) => void }) {
  const cards = detail?.analysis?.generatedCards || [];
  const diagnoses = detail?.analysis?.diagnoses || [];
  const strategies = detail?.analysis?.strategies || [];
  return (
    <section className="feedbackGrid">
      <div className="panel metricsPanel full">
        <Metric label="销售/店长反馈" value={metrics?.reviewEvents ?? 0} />
        <Metric label="人工修正率" value={`${metrics?.repairedSessions ?? 0}/${metrics?.totalSessions ?? 0}`} />
        <Metric label="已分析覆盖" value={`${metrics?.analyzedSessions ?? 0}/${metrics?.totalSessions ?? 0}`} />
        <Metric label="平均得分" value={metrics?.avgScore ?? 0} />
      </div>

      <div className="panel full feedbackGuide">
        <div className="sectionTitle">
          <h2>反馈层怎么用</h2>
          <span>反馈必须绑定到具体对象，才知道哪张卡片、哪条诊断、哪条策略有效。</span>
        </div>
        <div className="feedbackObjectFlow">
          <span>生成层卡片：销售采纳、修改、跟进</span>
          <span>诊断问题：店长确认、驳回、标记可挽回</span>
          <span>策略建议：运营观察效果，调整策略库</span>
        </div>
      </div>

      <div className="panel full">
        <div className="sectionTitle">
          <h2>生成层逐项反馈</h2>
          <span>对某一张建议卡、风险卡、话术卡单独反馈。</span>
        </div>
        {cards.length ? (
          <div className="feedbackObjectList">
            {cards.map((card) => (
              <article key={card.id} className="feedbackObjectCard">
                <div className="feedbackObjectHead">
                  <div>
                    <span>{card.type}</span>
                    <strong>{card.title}</strong>
                  </div>
                  <StatusChip label={card.status} tone="gray" />
                </div>
                <p>{card.content}</p>
                <div className="buttonRow">
                  {card.actions.map((action) => (
                    <button
                      key={action}
                      onClick={() => onFeedback(action, card.id, feedbackActorForAction(action), `${card.title}｜${action}`)}
                    >
                      {action}
                    </button>
                  ))}
                  <button onClick={() => onFeedback("驳回卡片", card.id, "manager", `${card.title}｜驳回卡片`)}>驳回卡片</button>
                  <button onClick={() => onFeedback("需运营优化", card.id, "operations", `${card.title}｜需运营优化`)}>
                    需运营优化
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无生成层内容" text="请先在单次接待工作台完成重新分析/评分。" />
        )}
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>诊断问题复核</h2>
          <span>用于确认质检问题是否成立。</span>
        </div>
        {diagnoses.length ? (
          <div className="feedbackObjectList compact">
            {diagnoses.map((item) => (
              <article key={item.id} className="feedbackObjectCard">
                <div className="feedbackObjectHead">
                  <div>
                    <span>{item.category}</span>
                    <strong>{item.issue}</strong>
                  </div>
                  <StatusChip label={item.riskLevel} tone={item.riskLevel.includes("高") ? "amber" : "blue"} />
                </div>
                <p>{item.reason || "规则命中"}</p>
                <div className="buttonRow">
                  <button onClick={() => onFeedback("确认问题", item.id, "manager", `${item.issue}｜确认问题`)}>确认问题</button>
                  <button onClick={() => onFeedback("驳回问题", item.id, "manager", `${item.issue}｜驳回问题`)}>驳回问题</button>
                  <button onClick={() => onFeedback("标记可挽回", item.id, "manager", `${item.issue}｜标记可挽回`)}>标记可挽回</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无诊断问题" text="完成分析后，这里会展示需要复核的质检问题。" />
        )}
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>策略效果反馈</h2>
          <span>用于调整策略库和优先级。</span>
        </div>
        {strategies.length ? (
          <div className="feedbackObjectList compact">
            {strategies.map((item) => (
              <article key={item.id} className="feedbackObjectCard">
                <div className="feedbackObjectHead">
                  <div>
                    <span>{item.priority}</span>
                    <strong>{item.issue}</strong>
                  </div>
                  <StatusChip label={item.timing} tone="teal" />
                </div>
                <p>{item.nextBestAction}</p>
                <div className="buttonRow">
                  <button onClick={() => onFeedback("策略有效", item.id, "operations", `${item.issue}｜策略有效`)}>策略有效</button>
                  <button onClick={() => onFeedback("策略无效", item.id, "operations", `${item.issue}｜策略无效`)}>策略无效</button>
                  <button onClick={() => onFeedback("调整策略", item.id, "operations", `${item.issue}｜调整策略`)}>调整策略</button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="暂无策略建议" text="诊断问题匹配策略后，这里会展示策略效果反馈入口。" />
        )}
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>反馈记录</h2>
          <span>{detail ? detail.session.reception_no : "未选择接待"}</span>
        </div>
        <div className="feedbackList">
          {detail?.feedback.length ? (
            detail.feedback.map((item) => (
              <article key={item.id}>
                <strong>{item.action}</strong>
                <span>{feedbackActorLabel(item.actorType)} · {feedbackTargetLabel(item.target, detail)}</span>
                {item.details && <span>{item.details}</span>}
                <small>{new Date(item.createdAt).toLocaleString("zh-CN")}</small>
              </article>
            ))
          ) : (
            <EmptyState title="暂无反馈" text="点击上方具体卡片、诊断或策略按钮记录反馈。" />
          )}
        </div>
      </div>
    </section>
  );
}

function feedbackActorForAction(action: string) {
  if (/驳回|通过|认可|复核/.test(action)) return "manager";
  if (/优化|策略/.test(action)) return "operations";
  return "sales";
}

function feedbackActorLabel(actorType: string) {
  const labels: Record<string, string> = {
    sales: "销售",
    manager: "店长",
    operations: "运营",
    qa: "质检员"
  };
  return labels[actorType] || actorType;
}

function feedbackTargetLabel(target: string, detail: SessionDetail | null) {
  if (!detail?.analysis) return target;
  const card = detail.analysis.generatedCards.find((item) => item.id === target);
  if (card) return `生成卡片：${card.title}`;
  const diagnosis = detail.analysis.diagnoses.find((item) => item.id === target);
  if (diagnosis) return `诊断问题：${diagnosis.issue}`;
  const strategy = detail.analysis.strategies.find((item) => item.id === target);
  if (strategy) return `策略建议：${strategy.issue}`;
  const labels: Record<string, string> = {
    generated_card: "生成卡片",
    sales_action: "销售端通用反馈",
    manager_review: "店长端通用复核"
  };
  return labels[target] || target;
}

type ConfigLayerKey = "factLayer" | "diagnosisLayer" | "strategyLayer" | "generationLayer" | "feedbackLayer";

const configLayerTabs: Array<{ key: ConfigLayerKey; title: string; effect: string }> = [
  { key: "factLayer", title: "事实层配置", effect: "配置大模型提示词、抽取字段、证据要求；只输出事实，不输出诊断和策略。" },
  { key: "diagnosisLayer", title: "诊断层配置", effect: "配置销售接待问题库、命中条件、风险等级、扣分和人工复核。" },
  { key: "strategyLayer", title: "策略层配置", effect: "配置策略库，将诊断问题匹配到下一步动作、材料、渠道和店长介入。" },
  { key: "generationLayer", title: "生成层配置", effect: "配置行动卡片模板、输出规范、禁用表述和反馈动作。" },
  { key: "feedbackLayer", title: "反馈层配置", effect: "配置反馈角色、动作、对象和覆盖策略，形成持续优化闭环。" }
];

const diagnosisConditionOptions = [
  { value: "missing_sop", label: "SOP动作缺失", help: "事实层判断某个销售动作没有完成时命中，例如未问预算、未邀约试驾。" },
  { value: "sop_count_lte", label: "需求挖掘项不足", help: "用途、预算、周期、决策人等关键需求问题完成数量不足时命中。" },
  { value: "missing_sop_and_fact", label: "动作与事实均缺失", help: "既没有销售动作，也没有从客户事实中看到相关信息时命中。" },
  { value: "decision_chain_open", label: "决策链未闭合", help: "客户存在家人、子女、领导等影响人，但销售没有确认下一步闭环。" },
  { value: "objection_unhandled", label: "异议未处理", help: "客户出现价格、竞品、金融、交付等异议，但销售没有有效处理。" },
  { value: "product_mismatch", label: "讲解偏离需求", help: "客户有明确关注点，但销售讲解没有围绕客户需求展开。" },
  { value: "missing_sop_when_intent", label: "有意向但动作缺失", help: "客户有中高意向，但销售漏掉报价、试驾、跟进等推进动作。" },
  { value: "quote_without_followup", label: "报价后无闭环", help: "销售已经报价，但没有约定下一步联系、复店或成交推进。" },
  { value: "high_intent_with_high_risk", label: "高意向叠加高风险", help: "客户意向较高，同时存在异议未闭合、决策链未闭合或风险片段。" },
  { value: "risk_segments_present", label: "存在风险片段", help: "事实层抽到合规、投诉、交付或价格解释风险时命中。" }
];

const standardConditionFieldOptions = [
  { value: "asked_use_case", label: "询问用途/场景" },
  { value: "asked_budget", label: "询问预算" },
  { value: "asked_purchase_timeline", label: "询问购车周期" },
  { value: "asked_decision_maker", label: "询问决策人" },
  { value: "introduced_product_by_need", label: "结合需求讲解" },
  { value: "invited_test_drive", label: "邀约试驾" },
  { value: "quoted_price", label: "报价" },
  { value: "handled_objection", label: "处理异议" },
  { value: "confirmed_next_followup", label: "确认下一步跟进" },
  { value: "价格", label: "价格/金融异议" },
  { value: "竞品", label: "竞品异议" },
  { value: "decision_chain_status", label: "决策链状态" },
  { value: "intent_level", label: "客户意向等级" },
  { value: "risk_segments", label: "风险片段" }
];

const evidenceSelectorOptions = [
  { value: "", label: "自动匹配证据" },
  { value: "all", label: "全部关键证据" },
  { value: "价格", label: "价格/预算证据" },
  { value: "竞品", label: "竞品证据" },
  { value: "decision_chain_status", label: "决策链证据" },
  { value: "introduced_product_by_need", label: "需求/关注点证据" },
  { value: "invited_test_drive", label: "体验/试驾证据" },
  { value: "confirmed_next_followup", label: "跟进闭环证据" },
  { value: "risk_segments", label: "风险片段证据" }
];

function SopQualityConfigPage({ config, onSave, loading }: { config: AnalysisConfig | null; onSave: (config: AnalysisConfig) => void; loading: boolean }) {
  const [draft, setDraft] = useState<AnalysisConfig | null>(null);

  useEffect(() => {
    if (config) setDraft(cloneConfig(config));
  }, [config]);

  if (!draft) return <EmptyState title="配置读取中" text="正在读取销售SOP质检配置。" />;

  const sopItems = Array.isArray(draft.sop) ? draft.sop : [];
  const diagnosisLayer = draft.diagnosisLayer || {};
  const derivedRules = diagnosisLayer.derivedRules || {};
  const checkObjects = getCheckObjects(diagnosisLayer, sopItems);
  const rules = Array.isArray(diagnosisLayer.rules) ? diagnosisLayer.rules : [];
  const stageCount = new Set(sopItems.map((item) => item.stage).filter(Boolean)).size;

  const updateSop = (index: number, patch: Record<string, string>) => {
    setDraft((current) => {
      if (!current) return current;
      const currentSop = Array.isArray(current.sop) ? current.sop : [];
      return { ...current, sop: currentSop.map((item, i) => (i === index ? { ...item, ...patch } : item)) };
    });
  };

  const updateDerivedRule = (group: string, key: string, value: number) => {
    setDraft({
      ...draft,
      diagnosisLayer: {
        ...diagnosisLayer,
        derivedRules: {
          ...derivedRules,
          [group]: { ...(derivedRules[group] || {}), [key]: value }
        }
      }
    });
  };

  const addSopAction = () => {
    const nextSop = newSopAction(sopItems.length);
    setDraft({
      ...draft,
      sop: [nextSop, ...sopItems],
      diagnosisLayer: {
        ...diagnosisLayer,
        checkObjects: [newCheckObjectFromSop(nextSop), ...checkObjects]
      }
    });
  };

  const save = () => onSave(draft);

  return (
    <section className="businessConfigGrid">
      <div className="panel full businessHero">
        <div className="sectionTitle">
          <h2>销售SOP质检配置</h2>
          <span>配置销售应该完成的动作，以及动作缺失后如何诊断、扣分、复核。保存后需重新分析录音才会生效。</span>
        </div>
        <div className="configStats four">
          <Metric label="SOP动作" value={sopItems.length} help="当前配置的销售必做或可检查动作数量。" />
          <Metric label="接待阶段" value={stageCount} help="SOP动作所属业务阶段去重后的数量，不是本次客户所处阶段。" />
          <Metric label="质量计算规则" value="4项" help="下方4项质量判定阈值的数量，不是本次质检得分。" />
          <Metric label="诊断问题规则" value={`${rules.length}条`} help="诊断层配置的规则总数，用于生成问题、风险和扣分，不是本次命中数。" />
        </div>
        <div className="businessFlow">
          <span>客户提供：销售SOP要求</span>
          <strong>→</strong>
          <span>事实层识别：实际发生的销售动作</span>
          <strong>→</strong>
          <span>规则计算：SOP完成情况与质量标签</span>
        </div>
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>SOP动作库</h2>
          <span>用于定义销售接待中应该完成的关键动作。</span>
        </div>
        <div className="configToolbar">
          <strong>动作字段</strong>
          <button onClick={addSopAction}>新增SOP动作</button>
        </div>
        <div className="configItemList">
          {sopItems.map((item, index) => (
            <article key={`${item.field}-${index}`} className="configItem">
              <div className="configItemHead">
                <strong>{item.label || item.field}</strong>
                <ConfigRowActions
                  onUp={() => setDraft({ ...draft, sop: moveItem(sopItems, index, -1) })}
                  onDown={() => setDraft({ ...draft, sop: moveItem(sopItems, index, 1) })}
                  onCopy={() => setDraft({ ...draft, sop: duplicateItem(sopItems, index) })}
                  onDelete={() => setDraft({ ...draft, sop: sopItems.filter((_, i) => i !== index) })}
                />
              </div>
              <div className="formGrid three">
                <label>接待阶段<input value={item.stage || ""} onChange={(event) => updateSop(index, { stage: event.target.value })} /></label>
                <label>动作名称<input value={item.label || ""} onChange={(event) => updateSop(index, { label: event.target.value })} /></label>
                <label>缺失默认问题<input value={item.missingDiagnosis || ""} onChange={(event) => updateSop(index, { missingDiagnosis: event.target.value })} /></label>
              </div>
              <SopActionExplanation item={item} />
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>质量标签计算规则</h2>
          <span>大模型只提取动作证据，以下阈值用于生成质量、匹配和处理结果。</span>
        </div>
        <div className="formGrid two">
          <label>需求挖掘“充分”最少完成项<input type="number" min="1" max="4" value={derivedRules.needDiscovery?.sufficientMin ?? 3} onChange={(event) => updateDerivedRule("needDiscovery", "sufficientMin", Number(event.target.value))} /></label>
          <label>需求挖掘“一般”最少完成项<input type="number" min="1" max="4" value={derivedRules.needDiscovery?.generalMin ?? 2} onChange={(event) => updateDerivedRule("needDiscovery", "generalMin", Number(event.target.value))} /></label>
          <label>产品讲解匹配最少对应关系<input type="number" min="1" value={derivedRules.productExplanation?.matchedPairMin ?? 1} onChange={(event) => updateDerivedRule("productExplanation", "matchedPairMin", Number(event.target.value))} /></label>
          <label>异议有效处理最少回应动作<input type="number" min="1" value={derivedRules.objectionHandling?.effectiveActionMin ?? 2} onChange={(event) => updateDerivedRule("objectionHandling", "effectiveActionMin", Number(event.target.value))} /></label>
        </div>
        <small className="hint">需求挖掘核心项默认是用途、预算、购买周期、决策人；销售是否完成动作由事实证据识别，不需要人工逐通选择字段。</small>
      </div>

      <div className="panel full sopBoundaryNote">
        <div>
          <strong>问题库与诊断条件已归入诊断层</strong>
          <span>“检查对象、命中条件、风险等级、扣分、人工复核”不是SOP要求本身，请在“规则配置中心 → 诊断层配置”维护。</span>
        </div>
        <div>
          <strong>为什么仍需要诊断层</strong>
          <span>SOP只说明销售应该做什么；诊断层负责判断什么情况下构成问题，以及是否扣分、展示哪条证据和是否需要复核。</span>
        </div>
      </div>

      <div className="panel full">
        <div className="buttonRow endActions">
          <button className="primary" onClick={save} disabled={loading}><Icon name="save" />保存销售SOP质检配置</button>
        </div>
      </div>
    </section>
  );
}

function SopActionExplanation({ item }: { item: Record<string, any> }) {
  const definitions: Record<string, { check: string; evidence: string }> = {
    asked_use_case: { check: "检查销售是否主动了解客户的用车人、使用场景和主要用途。", evidence: "销售询问用途的原话，以及客户对家用、通勤、商务等场景的回答。" },
    asked_budget: { check: "检查销售是否主动了解客户预算、价格承受范围或首付月供预期。", evidence: "销售询问预算或金融承受能力的原话，以及客户给出的金额或价格态度。" },
    asked_purchase_timeline: { check: "检查销售是否确认客户计划购车、提车或用车的时间。", evidence: "销售询问时间计划的原话，以及客户对近期、月份或具体节点的回答。" },
    asked_decision_maker: { check: "检查销售是否了解谁使用车辆、谁参与比较以及谁做最终决定。", evidence: "销售询问决策关系的原话，以及客户提到本人、家人或其他影响人的回答。" },
    introduced_product_by_need: { check: "检查销售讲解的产品卖点是否对应客户已表达的需求和关注点。", evidence: "客户需求原话、销售对应讲解，以及两者之间可以验证的对应关系。" },
    invited_test_drive: { check: "检查销售是否根据客户关注点提出明确的试驾或体验邀请。", evidence: "销售邀约试驾的原话、具体体验安排，以及客户是否接受。" },
    quoted_price: { check: "检查销售是否提供客户可理解的报价、落地价或费用构成。", evidence: "销售报价及价格拆解原话，包括车价、优惠、金融、保险或其他费用。" },
    handled_objection: { check: "检查销售是否针对客户异议追问原因、解释回应并推动下一步。", evidence: "客户异议原话、销售回应动作和客户回应，三者应能形成连续证据。" },
    confirmed_next_followup: { check: "检查离店或会话结束前是否约定下一次联系、复店或材料发送安排。", evidence: "跟进动作、明确时间、联系渠道及客户是否同意的原话。" }
  };
  const definition = definitions[item.field] || {
    check: `检查销售在“${item.stage || "当前"}”阶段是否完成“${item.label || "该动作"}”。`,
    evidence: "由事实层从销售与客户的连续原话中提取动作、回应和时间戳证据。"
  };
  return <div className="sopActionExplanation">
    <span><strong>检查内容</strong>{definition.check}</span>
    <span><strong>证据来源</strong>{definition.evidence}</span>
    <span><strong>缺失结果</strong>未找到有效证据时，诊断层按规则判断是否生成“{item.missingDiagnosis || "待配置问题"}”。</span>
  </div>;
}

function InsightMappingCard({ label, mode, facts, rule }: { label: string; mode: string; facts: string; rule: string }) {
  return <article className="insightMappingCard">
    <div><strong>{label}</strong><StatusChip label={mode} tone={mode === "规则计算" ? "blue" : "teal"} /></div>
    <span><b>依赖事实</b>{facts}</span>
    <span><b>生成逻辑</b>{rule}</span>
    <small>输出必须保留形成该标签的事实与原文证据，不允许脱离事实自由生成。</small>
  </article>;
}

function CustomerInsightConfigPage({ config, onSave, loading }: { config: AnalysisConfig | null; onSave: (config: AnalysisConfig) => void; loading: boolean }) {
  const [draft, setDraft] = useState<AnalysisConfig | null>(null);

  useEffect(() => {
    if (config) setDraft(cloneConfig(config));
  }, [config]);

  if (!draft) return <EmptyState title="配置读取中" text="正在读取客户洞察标签配置。" />;

  const factLayer = draft.factLayer || {};
  const fields = Array.isArray(factLayer.fields) ? factLayer.fields : [];
  const customerFields = fields.filter((item: any) => isCustomerInsightField(item));
  const customerTags = draft.customerTags || {};
  const insightRules = draft.customerInsightRules || {};
  const tagGroups = Object.entries(customerTags);
  const tagValueCount = tagGroups.reduce((total, [, values]) => total + values.length, 0);
  const ruleGroupCount = Object.keys(insightRules).length;

  const updateInsightRule = (group: string, key: string, value: any) => {
    setDraft({
      ...draft,
      customerInsightRules: {
        ...insightRules,
        [group]: { ...(insightRules[group] || {}), [key]: value }
      }
    });
  };

  const updateIntentWeight = (key: string, value: number) => {
    setDraft({
      ...draft,
      customerInsightRules: {
        ...insightRules,
        intent: {
          ...(insightRules.intent || {}),
          weights: { ...(insightRules.intent?.weights || {}), [key]: value }
        }
      }
    });
  };

  const updateTagGroup = (oldKey: string, nextKey: string, values: string[]) => {
    const nextTags = { ...customerTags };
    delete (nextTags as any)[oldKey];
    (nextTags as any)[nextKey || oldKey] = values;
    setDraft({ ...draft, customerTags: nextTags });
  };

  const save = () => onSave(draft);

  return (
    <section className="businessConfigGrid">
      <div className="panel full businessHero">
        <div className="sectionTitle">
          <h2>客户洞察标签配置</h2>
          <span>客户洞察不再次调用大模型；它把事实层的客观信号按标签树和规则转换为可运营的客户标签。</span>
        </div>
        <div className="configStats four">
          <Metric label="可选标签值" value={tagValueCount} help="所有标签组中可供规则输出的枚举值总数。" />
          <Metric label="客户标签组" value={tagGroups.length} help="当前配置的标签分类数量，不是本次命中的标签数。" />
          <Metric label="洞察规则组" value={ruleGroupCount} help="意向、异议和跟进等规则组数量，不增加大模型调用次数。" />
          <Metric label="依赖事实字段" value={customerFields.length} help="来自一次事实抽取、可用于计算客户标签的上游事实字段数量。" />
        </div>
        <div className="businessFlow">
          <span>客户提供：标签树、判断口径、样例标注</span>
          <strong>→</strong>
          <span>事实层一次抽取：客户表达、动作和证据</span>
          <strong>→</strong>
          <span>规则计算：洞察标签、原因和证据</span>
        </div>
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>客户标签树</h2>
          <span>定义业务可选标签值，避免模型输出相反或不在枚举里的标签。</span>
        </div>
        <div className="configToolbar">
          <strong>标签组</strong>
          <button onClick={() => setDraft({ ...draft, customerTags: { ...customerTags, [`新标签组${tagGroups.length + 1}`]: ["未提及"] } })}>新增标签组</button>
        </div>
        <div className="configItemList">
          {tagGroups.map(([group, values]) => (
            <article key={group} className="configItem">
              <div className="formGrid two">
                <label>标签组名称<input value={formatCustomerTagGroupLabel(group)} readOnly={isInternalCustomerTagGroup(group)} onChange={(event) => updateTagGroup(group, event.target.value, values)} /></label>
                <label>枚举值<input value={(values || []).join("、")} onChange={(event) => updateTagGroup(group, group, splitText(event.target.value))} /></label>
              </div>
              <div className="configItemHead">
                <small className="hint">建议保留“未提及/未知/不适用”等兜底值，避免模型强行打标。</small>
                <button onClick={() => {
                  const nextTags = { ...customerTags };
                  delete (nextTags as any)[group];
                  setDraft({ ...draft, customerTags: nextTags });
                }}>删除标签组</button>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="sectionTitle">
          <h2>事实到洞察映射</h2>
          <span>这里不配置抽取提示词，只说明每个洞察标签依赖哪些事实、按什么规则生成。</span>
        </div>
        <div className="insightMappingList">
          <InsightMappingCard label="意向等级" mode="规则计算" facts="客户购买与阻塞信号、客户需求与约束、销售推进与跟进约定" rule="购买信号按权重加分，明确拒绝和无购买需求扣分，再按下方阈值分档。" />
          <InsightMappingCard label="购买阶段" mode="规则计算" facts="场景事实、试驾/报价/金融/下订等购买信号" rule="按已发生的最深业务动作判断；没有明确动作时输出初步了解或无法判断。" />
          <InsightMappingCard label="异议类型" mode="枚举归一" facts="客户异议事实" rule="将客户明确表达归一到价格、竞品、产品不匹配、家人决策等客户标签枚举。" />
          <InsightMappingCard label="核心关注点" mode="枚举归一" facts="客户需求与约束、客户异议事实" rule="把空间、安全、智能、价格等明确表达映射到标签树；未出现则不打标签。" />
          <InsightMappingCard label="跟进价值" mode="规则计算" facts="意向等级、跟进许可信号、阻塞信号、销售跟进约定" rule="综合意向与联系许可输出高优先级、普通跟进、低优先级或不可跟进。" />
        </div>
      </div>

      <div className="panel full">
        <div className="sectionTitle">
          <h2>客户标签计算规则</h2>
          <span>千问抽取购买、阻塞和跟进信号；此处规则生成异议强度、是否可跟进和意向等级。</span>
        </div>
        <div className="configItemList">
          <article className="configItem">
            <h3>意向等级阈值</h3>
            <p className="ruleExplanation">这是意向累计分的分档线，不是三个独立得分。系统先累加下方购买信号和阻塞信号的分值，再按阈值输出高意向、中高意向、中意向、低意向或无法判断。</p>
            <div className="formGrid three">
              <label>高意向最低分<input type="number" value={insightRules.intent?.highMin ?? 7} onChange={(event) => updateInsightRule("intent", "highMin", Number(event.target.value))} /></label>
              <label>中高意向最低分<input type="number" value={insightRules.intent?.mediumHighMin ?? 4} onChange={(event) => updateInsightRule("intent", "mediumHighMin", Number(event.target.value))} /></label>
              <label>中意向最低分<input type="number" value={insightRules.intent?.mediumMin ?? 1} onChange={(event) => updateInsightRule("intent", "mediumMin", Number(event.target.value))} /></label>
            </div>
          </article>
          <article className="configItem">
            <h3>意向信号分值</h3>
            <p className="ruleExplanation">这是每类客观信号的加减权重。事实层识别到对应信号后由规则引擎累计，同一通对话可命中多项；正数提高意向分，负数降低意向分，大模型不直接给意向打分。</p>
            <div className="formGrid four">
              <label>下订/订金<input type="number" value={insightRules.intent?.weights?.order_or_deposit ?? 8} onChange={(event) => updateIntentWeight("order_or_deposit", Number(event.target.value))} /></label>
              <label>近期购买<input type="number" value={insightRules.intent?.weights?.near_purchase_timeline ?? 3} onChange={(event) => updateIntentWeight("near_purchase_timeline", Number(event.target.value))} /></label>
              <label>报价/优惠<input type="number" value={insightRules.intent?.weights?.quote_or_discount ?? 2} onChange={(event) => updateIntentWeight("quote_or_discount", Number(event.target.value))} /></label>
              <label>试驾/体验<input type="number" value={insightRules.intent?.weights?.test_drive ?? 2} onChange={(event) => updateIntentWeight("test_drive", Number(event.target.value))} /></label>
              <label>同意下一步<input type="number" value={insightRules.intent?.weights?.next_step_agreed ?? 2} onChange={(event) => updateIntentWeight("next_step_agreed", Number(event.target.value))} /></label>
              <label>明确需求/预算<input type="number" value={insightRules.intent?.weights?.clear_need_or_budget ?? 1} onChange={(event) => updateIntentWeight("clear_need_or_budget", Number(event.target.value))} /></label>
              <label>明确拒绝<input type="number" value={insightRules.intent?.weights?.explicit_refusal ?? -8} onChange={(event) => updateIntentWeight("explicit_refusal", Number(event.target.value))} /></label>
              <label>无购买需求<input type="number" value={insightRules.intent?.weights?.no_purchase_need ?? -6} onChange={(event) => updateIntentWeight("no_purchase_need", Number(event.target.value))} /></label>
            </div>
          </article>
          <article className="configItem">
            <h3>异议与跟进规则</h3>
            <p className="ruleExplanation">异议强度由出现次数、明确拒绝和是否阻碍试驾、报价、下订等推进动作计算；跟进规则用于识别客户明确要求停止联系或无效接待，并标记为不可跟进。</p>
            <div className="formGrid two">
              <label>异议达到“中”等级的重复次数<input type="number" min="1" value={insightRules.objectionStrength?.highOccurrenceMin ?? 2} onChange={(event) => updateInsightRule("objectionStrength", "highOccurrenceMin", Number(event.target.value))} /></label>
              <label>异议达到“高”等级的阻碍动作数<input type="number" min="1" value={insightRules.objectionStrength?.highBlockedActionMin ?? 1} onChange={(event) => updateInsightRule("objectionStrength", "highBlockedActionMin", Number(event.target.value))} /></label>
            </div>
            <div className="buttonRow">
              <label className="check"><input type="checkbox" checked={insightRules.followUp?.stopOnNoContactRequest !== false} onChange={(event) => updateInsightRule("followUp", "stopOnNoContactRequest", event.target.checked)} />客户要求停止联系时标记不可跟进</label>
              <label className="check"><input type="checkbox" checked={insightRules.followUp?.stopOnInvalidReception !== false} onChange={(event) => updateInsightRule("followUp", "stopOnInvalidReception", event.target.checked)} />无效接待标记不可跟进</label>
            </div>
          </article>
        </div>
      </div>

      <div className="panel full">
        <div className="buttonRow endActions">
          <button className="primary" onClick={save} disabled={loading}><Icon name="save" />保存客户洞察标签配置</button>
        </div>
      </div>
    </section>
  );
}

function AdvancedCapabilitiesConfigPage({ config, onSave, onRebuild, canRebuild, loading }: { config: AnalysisConfig | null; onSave: (config: AnalysisConfig) => void; onRebuild: () => void; canRebuild: boolean; loading: boolean }) {
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  useEffect(() => setDraft(config?.advancedCapabilities ? JSON.parse(JSON.stringify(config.advancedCapabilities)) : null), [config]);
  if (!config || !draft) return <EmptyState title="配置读取中" text="正在读取高级能力配置。" />;

  const updateCapability = (key: string, patch: Record<string, any>) => setDraft((current) => current ? { ...current, [key]: { ...(current[key] || {}), ...patch } } : current);
  const loss = draft.lossAnalysis || {};
  const capability = draft.salesCapability || {};
  const script = draft.excellentScript || {};
  const lossRules = Array.isArray(loss.reasonRules) ? loss.reasonRules : [];
  const dimensions = Array.isArray(capability.dimensions) ? capability.dimensions : [];
  const scriptWindow = script.globalWindow || {};
  const scriptScenes = Array.isArray(script.sceneGoals) ? script.sceneGoals : [];
  const scriptBehaviors = Array.isArray(script.behaviorStructures) ? script.behaviorStructures : [];
  const scriptReactions = Array.isArray(script.customerReactions) ? script.customerReactions : [];
  const scriptTransitions = Array.isArray(script.stateTransitions) ? script.stateTransitions : [];
  const scriptEliminations = Array.isArray(script.eliminationRules) ? script.eliminationRules : [];
  const scriptKnowledge = Array.isArray(script.knowledgeRequirements) ? script.knowledgeRequirements : [];
  const scriptReview = script.reviewRules || {};
  const scriptValidation = script.outcomeValidation || {};
  const updateScript = (patch: Record<string, any>) => updateCapability("excellentScript", patch);
  const updateScriptList = (key: string, list: any[], index: number, patch: Record<string, any>) => updateScript({ [key]: list.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  const save = () => onSave({ ...config, advancedCapabilities: draft });

  return (
    <section className="advancedCapabilityPage">
      <div className="panel full capabilityOverview">
        <div className="sectionTitle"><h2>策略行动与三项高级能力</h2><span>下一步行动由策略层直接输出；三项高级能力不重复读取整段录音调用大模型。</span></div>
        <div className="capabilityFlow">
          <span>事实层证据包</span><strong>→</strong><span>诊断问题与客户标签</span><strong>→</strong><span>策略层行动方案</span><strong>→</strong><span>三类高级结果</span><strong>→</strong><span>人工反馈确认</span>
        </div>
        <div className="logicNote"><strong>边界说明：</strong>策略层已经给出目标、执行步骤、时机、渠道、材料和是否需要店长介入，因此不再生成内容重复的“下一步跟进建议”卡片。</div>
      </div>

      <article className="panel capabilityConfigCard">
        <div className="capabilityCardHead"><div><h2>败单分析</h2><p>诊断层 + 生成层 + 反馈层</p></div><label className="check"><input type="checkbox" checked={loss.enabled !== false} onChange={(event) => updateCapability("lossAnalysis", { enabled: event.target.checked })} />启用</label></div>
        <div className="logicNote">先从诊断问题生成“候选败单原因”；只有客户反馈、业务系统或人工确认出现真实败单结果后，才能转为正式败单归因。</div>
        <div className="buttonRow">
          <label className="check"><input type="checkbox" checked={loss.requireBusinessOutcome !== false} onChange={(event) => updateCapability("lossAnalysis", { requireBusinessOutcome: event.target.checked })} />正式归因必须有业务结果</label>
          <label className="check"><input type="checkbox" checked={loss.candidateOnlyWithoutOutcome !== false} onChange={(event) => updateCapability("lossAnalysis", { candidateOnlyWithoutOutcome: event.target.checked })} />无业务结果只显示候选原因</label>
        </div>
        <label>复核角色<input value={(loss.reviewerRoles || []).join("、")} onChange={(event) => updateCapability("lossAnalysis", { reviewerRoles: splitText(event.target.value) })} /></label>
        <div className="configToolbar"><strong>败单原因规则</strong><button onClick={() => updateCapability("lossAnalysis", { reasonRules: [...lossRules, { enabled: true, name: "新败单候选原因", diagnosisKeywords: [], evidenceRequirement: "必须引用原文证据。" }] })}>新增原因规则</button></div>
        <div className="compactRuleList">
          {lossRules.map((item: any, index: number) => <div className="miniRule" key={`${item.name}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateCapability("lossAnalysis", { reasonRules: lossRules.map((rule: any, i: number) => i === index ? { ...rule, enabled: event.target.checked } : rule) })} />启用</label>
            <label>候选原因<input value={item.name || ""} onChange={(event) => updateCapability("lossAnalysis", { reasonRules: lossRules.map((rule: any, i: number) => i === index ? { ...rule, name: event.target.value } : rule) })} /></label>
            <label>关联诊断问题关键词<input value={(item.diagnosisKeywords || []).join("、")} onChange={(event) => updateCapability("lossAnalysis", { reasonRules: lossRules.map((rule: any, i: number) => i === index ? { ...rule, diagnosisKeywords: splitText(event.target.value) } : rule) })} /></label>
            <button onClick={() => updateCapability("lossAnalysis", { reasonRules: lossRules.filter((_: any, i: number) => i !== index) })}>删除</button>
          </div>)}
        </div>
      </article>

      <article className="panel capabilityConfigCard fullWidthCapability">
        <div className="capabilityCardHead"><div><h2>销售能力诊断</h2><p>诊断层 + 生成层</p></div><label className="check"><input type="checkbox" checked={capability.enabled !== false} onChange={(event) => updateCapability("salesCapability", { enabled: event.target.checked })} />启用</label></div>
        <div className="logicNote">单通录音只输出“本次接待能力表现”；累计达到配置样本数后，才汇总形成销售画像。当前明确排除合规表现、业务结果和改进趋势。</div>
        <div className="formGrid two">
          <label>形成销售画像的最少接待数<input type="number" min="1" value={capability.minimumSessionCount || 10} onChange={(event) => updateCapability("salesCapability", { minimumSessionCount: Number(event.target.value) })} /></label>
          <label>每个维度最多展示证据数<input type="number" min="1" value={capability.evidenceSampleCount || 3} onChange={(event) => updateCapability("salesCapability", { evidenceSampleCount: Number(event.target.value) })} /></label>
        </div>
        <div className="configToolbar"><strong>能力维度与诊断问题映射</strong><button onClick={() => updateCapability("salesCapability", { dimensions: [...dimensions, { enabled: true, name: "新能力维度", diagnosisKeywords: [] }] })}>新增能力维度</button></div>
        <div className="dimensionGrid">
          {dimensions.map((item: any, index: number) => <div className="miniRule" key={`${item.name}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateCapability("salesCapability", { dimensions: dimensions.map((row: any, i: number) => i === index ? { ...row, enabled: event.target.checked } : row) })} />启用</label>
            <label>能力维度<input value={item.name || ""} onChange={(event) => updateCapability("salesCapability", { dimensions: dimensions.map((row: any, i: number) => i === index ? { ...row, name: event.target.value } : row) })} /></label>
            <label>关联诊断问题关键词<input value={(item.diagnosisKeywords || []).join("、")} onChange={(event) => updateCapability("salesCapability", { dimensions: dimensions.map((row: any, i: number) => i === index ? { ...row, diagnosisKeywords: splitText(event.target.value) } : row) })} /></label>
            <button onClick={() => updateCapability("salesCapability", { dimensions: dimensions.filter((_: any, i: number) => i !== index) })}>删除</button>
          </div>)}
        </div>
      </article>

      <article className="panel capabilityConfigCard fullWidthCapability">
        <div className="capabilityCardHead"><div><h2>优秀话术挖掘</h2><p>事实层证据链 + 规则筛选 + 人工审核 + 业务结果验证</p></div><label className="check"><input type="checkbox" checked={script.enabled !== false} onChange={(event) => updateScript({ enabled: event.target.checked })} />启用</label></div>
        <div className="logicNote"><strong>判定原则：</strong>不是命中某个词就算优秀。系统复用事实层时序证据，验证“客户触发 → 销售有效回应 → 客户有效反应 → 会话状态跃迁”；通过产品知识校验和店长/内训师审核后形成门店话术，再用试驾、复店、报价、订车和成交结果持续验证。</div>
        <div className="capabilityRuleFlow">
          <article><b>1. 形成互动片段</b><span>按时间拼接客户、销售、客户三段角色链</span></article>
          <article><b>2. 验证有效行为</b><span>检查销售是否完成场景要求的关键动作结构</span></article>
          <article><b>3. 判断状态跃迁</b><span>识别信息披露、理解追问、异议软化或行动接受</span></article>
          <article><b>4. 审核与验证</b><span>知识校验、人工审核和后续业务结果验证</span></article>
        </div>

        <details className="scriptConfigSection" open>
          <summary><b>全局互动窗口</b><span>控制三段证据如何归入同一个互动片段</span></summary>
          <div className="formGrid three">
            <label>向前读取客户句数<input type="number" min="1" value={scriptWindow.customerTriggerTurns ?? 3} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, customerTriggerTurns: Number(event.target.value) } })} /></label>
            <label>客户触发时间窗（秒）<input type="number" min="10" value={scriptWindow.customerTriggerSeconds ?? 60} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, customerTriggerSeconds: Number(event.target.value) } })} /></label>
            <label>销售回应最多句数<input type="number" min="1" value={scriptWindow.salesResponseTurns ?? 5} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, salesResponseTurns: Number(event.target.value) } })} /></label>
            <label>销售回应时间窗（秒）<input type="number" min="10" value={scriptWindow.salesResponseSeconds ?? 120} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, salesResponseSeconds: Number(event.target.value) } })} /></label>
            <label>客户反应时间窗（秒）<input type="number" min="10" value={scriptWindow.customerReactionSeconds ?? 90} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, customerReactionSeconds: Number(event.target.value) } })} /></label>
            <label>每通最多候选数<input type="number" min="1" value={scriptWindow.maxCandidates ?? 3} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, maxCandidates: Number(event.target.value) } })} /></label>
            <label>单段最长（秒）<input type="number" min="30" value={scriptWindow.maxEpisodeSeconds ?? 180} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, maxEpisodeSeconds: Number(event.target.value) } })} /></label>
            <label>客户最低有效反应级别<input type="number" min="0" max="5" value={scriptWindow.minimumCustomerReactionLevel ?? 1} onChange={(event) => updateScript({ globalWindow: { ...scriptWindow, minimumCustomerReactionLevel: Number(event.target.value) } })} /></label>
          </div>
        </details>

        <details className="scriptConfigSection" open>
          <summary><b>1. 场景目标库</b><span>定义每个场景要推进到的有效结果</span></summary>
          <div className="scriptRuleGrid">{scriptScenes.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.name}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateScriptList("sceneGoals", scriptScenes, index, { enabled: event.target.checked })} />启用</label>
            <label>场景名称<input value={item.name || ""} onChange={(event) => updateScriptList("sceneGoals", scriptScenes, index, { name: event.target.value })} /></label>
            <label>场景目标<textarea value={item.objective || ""} onChange={(event) => updateScriptList("sceneGoals", scriptScenes, index, { objective: event.target.value })} /></label>
            <label>有效结果<textarea value={item.validResult || ""} onChange={(event) => updateScriptList("sceneGoals", scriptScenes, index, { validResult: event.target.value })} /></label>
            <label>场景识别词<input value={(item.matchTerms || []).join("、")} onChange={(event) => updateScriptList("sceneGoals", scriptScenes, index, { matchTerms: splitText(event.target.value) })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>2. 场景有效行为结构</b><span>配置关键动作、最少完成数和不可缺少动作</span></summary>
          <div className="scriptRuleGrid">{scriptBehaviors.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.scene}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateScriptList("behaviorStructures", scriptBehaviors, index, { enabled: event.target.checked })} />启用</label>
            <label>适用场景<input value={item.scene || ""} onChange={(event) => updateScriptList("behaviorStructures", scriptBehaviors, index, { scene: event.target.value })} /></label>
            <label>行为步骤<input value={(item.steps || []).join("、")} onChange={(event) => updateScriptList("behaviorStructures", scriptBehaviors, index, { steps: splitText(event.target.value) })} /></label>
            <label>最少完成步骤<input type="number" min="1" value={item.minimumSteps ?? 1} onChange={(event) => updateScriptList("behaviorStructures", scriptBehaviors, index, { minimumSteps: Number(event.target.value) })} /></label>
            <label>不可缺少步骤<input value={(item.requiredSteps || []).join("、")} onChange={(event) => updateScriptList("behaviorStructures", scriptBehaviors, index, { requiredSteps: splitText(event.target.value) })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>3. 客户有效反应枚举</b><span>0级无效，1至5级表示越来越强的流程推进</span></summary>
          <div className="scriptRuleGrid">{scriptReactions.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.level}-${index}`}>
            <label>级别<input type="number" min="0" max="5" value={item.level ?? 0} onChange={(event) => updateScriptList("customerReactions", scriptReactions, index, { level: Number(event.target.value) })} /></label>
            <label>名称<input value={item.name || ""} onChange={(event) => updateScriptList("customerReactions", scriptReactions, index, { name: event.target.value })} /></label>
            <label>业务含义<textarea value={item.meaning || ""} onChange={(event) => updateScriptList("customerReactions", scriptReactions, index, { meaning: event.target.value })} /></label>
            <label>反应示例<input value={(item.examples || []).join("、")} onChange={(event) => updateScriptList("customerReactions", scriptReactions, index, { examples: splitText(event.target.value) })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>4. 会话状态跃迁规则</b><span>只有从旧状态进入可观察的新状态才成立</span></summary>
          <div className="scriptRuleGrid">{scriptTransitions.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.scene}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateScriptList("stateTransitions", scriptTransitions, index, { enabled: event.target.checked })} />启用</label>
            <label>场景<input value={item.scene || ""} onChange={(event) => updateScriptList("stateTransitions", scriptTransitions, index, { scene: event.target.value })} /></label>
            <label>原状态<input value={item.from || ""} onChange={(event) => updateScriptList("stateTransitions", scriptTransitions, index, { from: event.target.value })} /></label>
            <label>目标状态<input value={item.to || ""} onChange={(event) => updateScriptList("stateTransitions", scriptTransitions, index, { to: event.target.value })} /></label>
            <label>最低反应级别<input type="number" min="0" max="5" value={item.minimumReactionLevel ?? 1} onChange={(event) => updateScriptList("stateTransitions", scriptTransitions, index, { minimumReactionLevel: Number(event.target.value) })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>5. 话术淘汰规则</b><span>存在风险、泛化讲解或无增量价值时直接淘汰</span></summary>
          <div className="scriptRuleGrid">{scriptEliminations.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.name}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateScriptList("eliminationRules", scriptEliminations, index, { enabled: event.target.checked })} />启用</label>
            <label>淘汰项<input value={item.name || ""} onChange={(event) => updateScriptList("eliminationRules", scriptEliminations, index, { name: event.target.value })} /></label>
            <label>判断说明<textarea value={item.description || ""} onChange={(event) => updateScriptList("eliminationRules", scriptEliminations, index, { description: event.target.value })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>6. 产品知识正确性要求</b><span>防止表达流畅但产品、价格或政策错误</span></summary>
          <div className="scriptRuleGrid">{scriptKnowledge.map((item: any, index: number) => <article className="scriptRuleCard" key={`${item.category}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateScriptList("knowledgeRequirements", scriptKnowledge, index, { enabled: event.target.checked })} />启用</label>
            <label>知识类别<input value={item.category || ""} onChange={(event) => updateScriptList("knowledgeRequirements", scriptKnowledge, index, { category: event.target.value })} /></label>
            <label>正确性要求<textarea value={item.requirement || ""} onChange={(event) => updateScriptList("knowledgeRequirements", scriptKnowledge, index, { requirement: event.target.value })} /></label>
            <label>容错标准<input value={item.tolerance || ""} onChange={(event) => updateScriptList("knowledgeRequirements", scriptKnowledge, index, { tolerance: event.target.value })} /></label>
          </article>)}</div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>7. 店长/内训师审核规则</b><span>候选不会自动进入正式话术库</span></summary>
          <div className="formGrid three">
            <label>审核角色<input value={(scriptReview.reviewerRoles || []).join("、")} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, reviewerRoles: splitText(event.target.value) } })} /></label>
            <label>审核动作<input value={(scriptReview.reviewActions || []).join("、")} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, reviewActions: splitText(event.target.value) } })} /></label>
            <label>审核时限（小时）<input type="number" min="1" value={scriptReview.deadlineHours ?? 48} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, deadlineHours: Number(event.target.value) } })} /></label>
            <label>正式入库最少通过人数<input type="number" min="1" value={scriptReview.officialMinimumApprovals ?? 2} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, officialMinimumApprovals: Number(event.target.value) } })} /></label>
            <label>最多修改次数<input type="number" min="0" value={scriptReview.maxEdits ?? 2} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, maxEdits: Number(event.target.value) } })} /></label>
            <label className="check"><input type="checkbox" checked={scriptReview.productExpertOnKnowledgeConflict !== false} onChange={(event) => updateScript({ reviewRules: { ...scriptReview, productExpertOnKnowledgeConflict: event.target.checked } })} />知识冲突时必须产品专家复核</label>
          </div>
        </details>

        <details className="scriptConfigSection">
          <summary><b>8. 后续试驾、复店、成交效果验证</b><span>只做效果关联，不把相关性直接写成因果</span></summary>
          <div className="formGrid three">
            <label>试驾验证窗（天）<input type="number" min="1" value={scriptValidation.testDriveDays ?? 7} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, testDriveDays: Number(event.target.value) } })} /></label>
            <label>复店验证窗（天）<input type="number" min="1" value={scriptValidation.revisitDays ?? 14} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, revisitDays: Number(event.target.value) } })} /></label>
            <label>报价验证窗（天）<input type="number" min="1" value={scriptValidation.quoteDays ?? 14} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, quoteDays: Number(event.target.value) } })} /></label>
            <label>订车验证窗（天）<input type="number" min="1" value={scriptValidation.orderDays ?? 30} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, orderDays: Number(event.target.value) } })} /></label>
            <label>成交/败单验证窗（天）<input type="number" min="1" value={scriptValidation.dealOrLossDays ?? 60} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, dealOrLossDays: Number(event.target.value) } })} /></label>
            <label>门店验证最少使用次数<input type="number" min="1" value={scriptValidation.storeValidatedUses ?? 10} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, storeValidatedUses: Number(event.target.value) } })} /></label>
            <label>门店验证最少销售人数<input type="number" min="1" value={scriptValidation.storeValidatedSalespeople ?? 3} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, storeValidatedSalespeople: Number(event.target.value) } })} /></label>
            <label>标杆话术最少使用次数<input type="number" min="1" value={scriptValidation.benchmarkUses ?? 30} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, benchmarkUses: Number(event.target.value) } })} /></label>
            <label>标杆话术最少销售人数<input type="number" min="1" value={scriptValidation.benchmarkSalespeople ?? 5} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, benchmarkSalespeople: Number(event.target.value) } })} /></label>
            <label>相对基线提升（百分点）<input type="number" min="0" value={scriptValidation.baselineLiftPoints ?? 5} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, baselineLiftPoints: Number(event.target.value) } })} /></label>
            <label>负向反应降级阈值（%）<input type="number" min="0" value={scriptValidation.downgradeNegativeReactionRate ?? 15} onChange={(event) => updateScript({ outcomeValidation: { ...scriptValidation, downgradeNegativeReactionRate: Number(event.target.value) } })} /></label>
          </div>
          <small className="fieldHelp">候选话术 → 人工审核话术 → 门店验证话术 → 标杆话术。使用次数和覆盖人数只是必要条件，还要与同场景基线比较流程推进率。</small>
        </details>
      </article>

      <div className="panel fullWidthCapability"><div className="buttonRow endActions"><button onClick={onRebuild} disabled={loading || !canRebuild}><Icon name="loop" />使用现有事实包刷新结果</button><button className="primary" onClick={save} disabled={loading}><Icon name="save" />保存高级能力配置</button></div><small className="fieldHelp">先保存配置，再刷新结果。刷新只重跑诊断、策略、生成和反馈规则，不会再次调用千问。</small></div>
    </section>
  );
}

function SemanticModelPage({ config, onSave, loading }: { config: AnalysisConfig | null; onSave: (config: AnalysisConfig) => void; loading: boolean }) {
  const [draft, setDraft] = useState<AnalysisConfig | null>(config);
  const [tab, setTab] = useState("实体");
  useEffect(() => setDraft(config), [config]);
  if (!draft?.semanticModel) return <EmptyState title="语义模型读取中" text="正在加载实体、属性和关系配置。" />;
  const model = draft.semanticModel;
  const update = (semanticModel: NonNullable<AnalysisConfig["semanticModel"]>) => setDraft({ ...draft, semanticModel });
  const tabs = ["实体", "属性", "关系", "提示词映射", "枚举", "同义词", "品牌扩展"];
  const promptFields = Array.isArray((draft.factLayer as any)?.fields) ? (draft.factLayer as any).fields.filter((item: any) => item.enabled !== false) : [];

  return (
    <section className="semanticPage">
      <div className="panel full">
        <div className="sectionTitle">
          <h2>本体与配置中心</h2>
          <span>先定义实体、属性、关系和枚举，再把事实字段提示词绑定到本体；品牌差异只做扩展。</span>
        </div>
        <div className="semanticSummary">
          <Metric label="实体" value={model.entities.length} />
          <Metric label="属性" value={model.attributes.length} />
          <Metric label="关系" value={model.relationships.length} />
          <Metric label="事实提示词" value={promptFields.length} />
          <Metric label="品牌扩展" value={model.brandExtensions.length} />
        </div>
        <div className="semanticTabs" role="tablist">
          {tabs.map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
        </div>

        {tab === "实体" && <div className="semanticConfigList">
          <div className="listToolbar"><strong>业务实体</strong><button onClick={() => update({ ...model, entities: [...model.entities, { name: "新实体", description: "请说明这个实体代表的业务对象。", enabled: true }] })}>新增实体</button></div>
          {model.entities.map((item, index) => <div className="semanticRow entityRow" key={`${item.name}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled} onChange={(e) => update({ ...model, entities: replaceAt(model.entities, index, { ...item, enabled: e.target.checked }) })} />启用</label>
            <label>实体名称<input value={item.name} onChange={(e) => update({ ...model, entities: replaceAt(model.entities, index, { ...item, name: e.target.value }) })} /></label>
            <label>业务含义<input value={item.description} onChange={(e) => update({ ...model, entities: replaceAt(model.entities, index, { ...item, description: e.target.value }) })} /></label>
            <button onClick={() => update({ ...model, entities: model.entities.filter((_, i) => i !== index) })}>删除</button>
          </div>)}
        </div>}

        {tab === "属性" && <div className="semanticConfigList">
          <div className="listToolbar"><strong>实体属性</strong><button onClick={() => update({ ...model, attributes: [...model.attributes, { entity: model.entities[0]?.name || "接待会话", name: "新属性", dataType: "文本", required: false, description: "请说明该属性的取值含义。" }] })}>新增属性</button></div>
          {model.attributes.map((item, index) => <div className="semanticRow propertyRow" key={`${item.entity}-${item.name}-${index}`}>
            <label>所属实体<select value={item.entity} onChange={(e) => update({ ...model, attributes: replaceAt(model.attributes, index, { ...item, entity: e.target.value }) })}>{model.entities.map((entity) => <option key={entity.name}>{entity.name}</option>)}</select></label>
            <label>属性名称<input value={item.name} onChange={(e) => update({ ...model, attributes: replaceAt(model.attributes, index, { ...item, name: e.target.value }) })} /></label>
            <label>数据类型<select value={item.dataType} onChange={(e) => update({ ...model, attributes: replaceAt(model.attributes, index, { ...item, dataType: e.target.value }) })}><option>文本</option><option>数字</option><option>布尔值</option><option>时间</option><option>枚举</option><option>多项列表</option></select></label>
            <label className="check"><input type="checkbox" checked={item.required} onChange={(e) => update({ ...model, attributes: replaceAt(model.attributes, index, { ...item, required: e.target.checked }) })} />必填</label>
            <label className="wide">属性含义<input value={item.description} onChange={(e) => update({ ...model, attributes: replaceAt(model.attributes, index, { ...item, description: e.target.value }) })} /></label>
            <button onClick={() => update({ ...model, attributes: model.attributes.filter((_, i) => i !== index) })}>删除</button>
          </div>)}
        </div>}

        {tab === "关系" && <div className="semanticConfigList">
          <div className="listToolbar"><strong>实体关系</strong><button onClick={() => update({ ...model, relationships: [...model.relationships, { source: model.entities[0]?.name || "接待会话", relation: "关联", target: model.entities[1]?.name || "原文片段", description: "请说明关系成立的业务条件。", enabled: true }] })}>新增关系</button></div>
          {model.relationships.map((item, index) => <div className="semanticRow relationRow" key={`${item.source}-${item.relation}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled} onChange={(e) => update({ ...model, relationships: replaceAt(model.relationships, index, { ...item, enabled: e.target.checked }) })} />启用</label>
            <label>起点实体<select value={item.source} onChange={(e) => update({ ...model, relationships: replaceAt(model.relationships, index, { ...item, source: e.target.value }) })}>{model.entities.map((entity) => <option key={entity.name}>{entity.name}</option>)}</select></label>
            <label>关系名称<input value={item.relation} onChange={(e) => update({ ...model, relationships: replaceAt(model.relationships, index, { ...item, relation: e.target.value }) })} /></label>
            <label>终点实体<select value={item.target} onChange={(e) => update({ ...model, relationships: replaceAt(model.relationships, index, { ...item, target: e.target.value }) })}>{model.entities.map((entity) => <option key={entity.name}>{entity.name}</option>)}</select></label>
            <label className="wide">成立条件<input value={item.description} onChange={(e) => update({ ...model, relationships: replaceAt(model.relationships, index, { ...item, description: e.target.value }) })} /></label>
            <button onClick={() => update({ ...model, relationships: model.relationships.filter((_, i) => i !== index) })}>删除</button>
          </div>)}
        </div>}

        {tab === "提示词映射" && <div className="semanticConfigList">
          <div className="listToolbar"><strong>事实字段与本体映射</strong><span className="hint">7类字段在一次完整模型请求中共同抽取；每个字段提示词只约束本字段，不增加模型调用次数。</span></div>
          <div className="ontoPromptFlow">
            <span>全局系统提示词</span><b>→</b><span>本体实体与关系</span><b>→</b><span>字段提示词</span><b>→</b><span>结构化事实与证据</span>
          </div>
          {promptFields.map((item: any, index: number) => <article className="ontoPromptRow" key={item.key || index}>
            <div><small>事实字段</small><strong>{item.field || item.key}</strong><span>{item.category || "洞察事实"}</span></div>
            <div><small>映射本体</small><strong>{ontoEntityForField(item)}</strong><span>{item.meaning || "请配置业务含义"}</span></div>
            <div><small>字段提示词</small><p>{item.modelPrompt || "请配置抽取提示词"}</p></div>
            <div><small>输出约束</small><p>{item.outputRequirement || "结构化值与原文证据"}</p></div>
          </article>)}
          <div className="logicNote"><strong>一次调用原则：</strong>系统把全局提示词、本体定义、全部启用字段和完整转写一次性发送给千问；大模型只形成事实包，后续诊断、策略、卡片和反馈不再次读取完整录音。</div>
        </div>}

        {tab === "枚举" && <SemanticSimpleList title="枚举字典" addLabel="新增枚举" items={model.enums} fields={["name", "values", "description"]} labels={["枚举名称", "可选值（顿号分隔）", "业务含义"]} onChange={(items) => update({ ...model, enums: items as typeof model.enums })} defaults={{ name: "新枚举", values: "未提及", description: "请说明各枚举值的判断口径。" }} />}
        {tab === "同义词" && <SemanticSimpleList title="同义词归一" addLabel="新增同义词" items={model.synonyms} fields={["canonical", "aliases", "scope"]} labels={["标准词", "同义表达（顿号分隔）", "适用范围"]} onChange={(items) => update({ ...model, synonyms: items as typeof model.synonyms })} defaults={{ canonical: "新标准词", aliases: "同义表达", scope: "汽车行业" }} />}
        {tab === "品牌扩展" && <div className="semanticConfigList">
          <div className="listToolbar"><strong>品牌扩展</strong><button onClick={() => update({ ...model, brandExtensions: [...model.brandExtensions, { brand: "新品牌", entity: "车型", property: "品牌特性", value: "请填写品牌专属知识", enabled: true }] })}>新增品牌扩展</button></div>
          {model.brandExtensions.length === 0 && <EmptyState title="暂无品牌扩展" text="行业通用事实层可直接使用；有品牌专属车型、卖点或术语时再增加。" />}
          {model.brandExtensions.map((item, index) => <div className="semanticRow brandRow" key={`${item.brand}-${index}`}>
            <label className="check"><input type="checkbox" checked={item.enabled} onChange={(e) => update({ ...model, brandExtensions: replaceAt(model.brandExtensions, index, { ...item, enabled: e.target.checked }) })} />启用</label>
            <label>品牌<input value={item.brand} onChange={(e) => update({ ...model, brandExtensions: replaceAt(model.brandExtensions, index, { ...item, brand: e.target.value }) })} /></label>
            <label>所属实体<select value={item.entity} onChange={(e) => update({ ...model, brandExtensions: replaceAt(model.brandExtensions, index, { ...item, entity: e.target.value }) })}>{model.entities.map((entity) => <option key={entity.name}>{entity.name}</option>)}</select></label>
            <label>扩展属性<input value={item.property} onChange={(e) => update({ ...model, brandExtensions: replaceAt(model.brandExtensions, index, { ...item, property: e.target.value }) })} /></label>
            <label className="wide">扩展内容<input value={item.value} onChange={(e) => update({ ...model, brandExtensions: replaceAt(model.brandExtensions, index, { ...item, value: e.target.value }) })} /></label>
            <button onClick={() => update({ ...model, brandExtensions: model.brandExtensions.filter((_, i) => i !== index) })}>删除</button>
          </div>)}
        </div>}

        <div className="layerSaveFooter"><span>保存后，新分析会按这套语义口径归一事实；历史结果不会被自动改写。</span><button className="primary" disabled={loading} onClick={() => onSave(draft)}><Icon name="save" />保存语义模型</button></div>
      </div>
    </section>
  );
}

function SemanticSimpleList({ title, addLabel, items, fields, labels, onChange, defaults }: { title: string; addLabel: string; items: Array<Record<string, any>>; fields: string[]; labels: string[]; onChange: (items: Array<Record<string, any>>) => void; defaults: Record<string, any> }) {
  return <div className="semanticConfigList">
    <div className="listToolbar"><strong>{title}</strong><button onClick={() => onChange([...items, defaults])}>{addLabel}</button></div>
    {items.map((item, index) => <div className="semanticRow simpleRow" key={`${String(item[fields[0]])}-${index}`}>
      {fields.map((field, fieldIndex) => <label key={field}>{labels[fieldIndex]}<input value={String(item[field] || "")} onChange={(e) => onChange(replaceAt(items, index, { ...item, [field]: e.target.value }))} /></label>)}
      <button onClick={() => onChange(items.filter((_, i) => i !== index))}>删除</button>
    </div>)}
  </div>;
}

function EvidenceReasoningPage({ detail }: { detail: SessionDetail | null }) {
  const [stage, setStage] = useState("原文");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [playerStatus, setPlayerStatus] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const linkedTranscriptRef = useRef<HTMLDivElement | null>(null);
  if (!detail) return <EmptyState title="未选择接待" text="请先从接待会话中心选择一条真实接待记录。" />;
  if (!detail.analysis) return <EmptyState title="尚未形成推理链" text="请先在单次接待工作台完成事实层分析。" />;
  const analysis = detail.analysis;
  const semantic = analysis.semanticPackage || {};
  const facts: FactExtractionItem[] = Array.isArray(analysis.factPackage?.extractedFacts) ? analysis.factPackage.extractedFacts : [];
  const audioSrc = detail.session.audioPath ? `/api/sessions/${detail.session.id}/audio` : "";
  type ReasoningSection = { label: string; values: string[]; tone?: "positive" | "partial" | "warning" | "info" | "action" };
  type ReasoningItem = { title: string; text: string; evidence?: Evidence[]; meta?: string; atSec?: number | null; transcript?: TranscriptUtterance[]; sections?: ReasoningSection[]; relatedIssue?: string };
  const meaningful = (values?: string[]) => (values || []).filter((value) => value && value !== "未提及");
  const diagnosisSections = (item: DiagnosisResult): ReasoningSection[] => {
    if (!item.factBasis) return [
      { label: "问题分类", values: [item.category || "未分类"], tone: "info" },
      { label: "命中原因", values: [item.reason || "规则命中"], tone: "warning" },
      { label: "风险等级", values: [`${item.riskLevel || "中"}风险`], tone: "info" }
    ];
    return [
      { label: "客户已明确", values: meaningful(item.factBasis["已明确"]), tone: "positive" },
      { label: "客户部分明确", values: meaningful(item.factBasis["部分明确"]), tone: "partial" },
      { label: "仍未明确", values: meaningful(item.factBasis["未明确"]), tone: "warning" },
      { label: "销售未主动询问或复述确认", values: meaningful(item.factBasis["销售未确认"]), tone: "warning" },
      { label: "诊断口径", values: ["该诊断只评价销售的确认动作，不否定客户已经主动表达的事实。"], tone: "info" }
    ];
  };
  const strategySections = (item: StrategyResult): ReasoningSection[] => [
    { label: "要解决的问题", values: [item.issue], tone: "warning" },
    { label: "策略目标", values: [item.strategyObjective || `针对“${item.issue}”形成可执行的销售动作`], tone: "info" },
    { label: "给销售的执行步骤", values: meaningful(item.actionSteps?.length ? item.actionSteps : [item.nextBestAction]), tone: "action" },
    { label: "执行时机", values: [item.timing || "待配置"], tone: "info" },
    { label: "触达渠道", values: [item.channel || "待配置"], tone: "info" },
    { label: "所需材料", values: item.materials?.length ? item.materials : ["无需额外材料"], tone: "info" },
    { label: "店长介入", values: [item.needManagerIntervention ? "需要店长协同" : "销售可自行执行"], tone: "info" },
    { label: "配置来源", values: [item.strategySource || `策略库：${item.strategyCategory || "已配置策略"}`], tone: "info" }
  ];
  const splitDisplayText = (text?: string) => String(text || "未提及").split(/[；\n]+/).map((value) => value.trim()).filter(Boolean);
  const stages: Array<{ name: string; label: string; items: ReasoningItem[] }> = [
    { name: "原文", label: "原文证据", items: detail.transcript.filter((item) => item.included).map((item) => ({ title: `${formatTime(item.startSec)} ${formatChineseLabel(item.role)}`, text: item.text, sections: [{ label: "ASR转写内容", values: [item.text], tone: "info" }], evidence: [{ timestamp: formatTime(item.startSec), speaker: item.role, quote: item.text, type: "原文证据" }] })) },
    { name: "事实", label: "事实层", items: facts.map((item) => {
      const rows = formatFactEntries(item.value).map((row) => `${row.label}：${row.value}`);
      return { title: displayFactFieldName(item), text: rows.join("；"), sections: [{ label: "事实抽取结果", values: rows.length ? rows : ["未提及"], tone: "positive" }], evidence: getFactEvidence(item) };
    }) },
    { name: "诊断", label: "诊断层", items: analysis.diagnoses.map((item) => ({ title: item.issue, text: item.factBasis ? `已明确、部分明确、仍未明确及销售确认动作已分别列示` : item.reason || "规则命中", sections: diagnosisSections(item), evidence: item.evidence, meta: `诊断规则：${formatConfigCodeLabel(item.ruleId)}` })) },
    { name: "策略", label: "策略层", items: analysis.strategies.map((item) => ({ title: item.strategyTitle || `${item.strategyCategory || "销售推进"}行动策略`, relatedIssue: item.issue, text: item.strategyObjective || item.nextBestAction, sections: strategySections(item), evidence: item.evidenceToShow })) },
    { name: "卡片", label: "生成层", items: analysis.generatedCards.map((item) => ({ title: item.title, text: item.content, sections: [{ label: "生成内容", values: splitDisplayText(item.content), tone: "action" }, { label: "可反馈动作", values: item.actions?.length ? item.actions : ["暂无反馈动作"], tone: "info" }], evidence: item.evidence, meta: `卡片类型：${formatConfigCodeLabel(item.type)}` })) },
    { name: "时序", label: "时序链", items: (semantic.timeline || []).map((item: any) => buildTimelineReasoningItem(item, semantic, analysis, detail.transcript)) },
    { name: "冲突", label: "冲突处理", items: (semantic.conflicts || []).map((item: any) => ({ title: item.factName, text: `${item.conflictType}；${item.resolutionRule}`, sections: [{ label: "冲突类型", values: [item.conflictType], tone: "warning" }, { label: "处理规则", values: [item.resolutionRule], tone: "action" }, { label: "处理状态", values: [item.status], tone: "info" }], evidence: (item.candidates || []).map((row: any) => ({ timestamp: row.timestamp, speaker: row.speaker, quote: row.quote, type: "冲突候选证据" })), meta: `状态：${item.status}` })) },
    { name: "溯源", label: "溯源记录", items: (semantic.provenance || []).map((item: any) => {
      const source = (semantic.evidence || []).find((row: any) => row.id === item.sourceId);
      const target = (semantic.facts || []).find((row: any) => row.id === item.targetId);
      return { title: `${source?.timestamp || ""} ${source?.speaker || "原文"} → ${target?.name || "洞察事实"}`, text: item.rule, evidence: source ? [{ timestamp: source.timestamp, speaker: source.speaker, quote: source.quote, type: source.evidenceType }] : [], meta: `${item.sourceType} ${item.relation} ${item.targetType}` };
    }) }
  ];
  const current = stages.find((item) => item.name === stage) || stages[0];
  const selected = current.items[selectedIndex] || current.items[0];
  function chooseStage(name: string) { setStage(name); setSelectedIndex(0); }
  async function playAt(second?: number | null) {
    const audio = audioRef.current;
    if (!audio || second == null) {
      setPlayerStatus(audioSrc ? "该事件没有可定位的录音时间。" : "当前接待没有关联录音文件，只能查看ASR转写。 ");
      return;
    }
    try {
      audio.currentTime = Math.max(0, second);
      await audio.play();
      setPlayerStatus(`正在播放 ${formatTime(second)} 对应录音`);
    } catch (error) {
      setPlayerStatus(error instanceof Error ? `播放失败：${error.message}` : "播放失败");
    }
  }
  return <section className="reasoningPage">
    <div className="panel full">
      <div className="sectionTitle"><h2>证据与推理链</h2><span>{detail.session.reception_no} · 基于{analysis.basedOnVersion === "ai_original" ? "AI原始文本" : "人工修正文本"} · {new Date(analysis.analyzedAt).toLocaleString("zh-CN")}</span></div>
      <div className="semanticRuntimeSummary">
        <Metric label="会话片段" value={(semantic.segments || []).length} />
        <Metric label="洞察事实" value={(semantic.facts || []).length} />
        <Metric label="溯源关系" value={(semantic.provenance || []).length} />
        <Metric label="冲突待复核" value={(semantic.conflicts || []).length} />
      </div>
      <div className="reasoningStageBar">
        {stages.map((item, index) => <React.Fragment key={item.name}><button className={stage === item.name ? "active" : ""} onClick={() => chooseStage(item.name)}><span>{index + 1}</span><strong>{item.label}</strong><small>{item.items.length}项</small></button>{index < stages.length - 1 && <b>→</b>}</React.Fragment>)}
      </div>
    </div>
    <div className="reasoningLayout">
      <div className={`panel reasoningItems reasoningItems-${stage}`}><div className="sectionTitle"><h2>{current.label}结果</h2><span>点击查看形成依据</span></div>
        {current.items.length === 0 ? <EmptyState title={`暂无${current.label}结果`} text="当前会话尚未生成这一层数据。" /> : current.items.map((item, index) => <button key={`${item.title}-${index}`} className={index === selectedIndex ? "active" : ""} onClick={() => setSelectedIndex(index)}><strong>{item.title}</strong>{item.relatedIssue && <small>解决问题：{item.relatedIssue}</small>}<span>{item.text || "未提及"}</span></button>)}
      </div>
      <div className="panel reasoningDetail"><div className="sectionTitle"><h2>形成依据</h2><span>结论必须可回溯到原文</span></div>
        {!selected ? <EmptyState title="暂无可查看内容" text="请选择左侧结果项。" /> : <><h3>{selected.title}</h3>{selected.sections?.length ? <div className="reasoningSections">{selected.sections.filter((section) => section.values.length).map((section) => <div className={`reasoningSection ${section.tone || "info"}`} key={section.label}><strong>{section.label}</strong><div>{section.values.map((value, index) => <p key={`${value}-${index}`}>{value}</p>)}</div></div>)}</div> : <div className="reasoningSections"><div className="reasoningSection info"><strong>说明</strong><div>{splitDisplayText(selected.text).map((value, index) => <p key={`${value}-${index}`}>{value}</p>)}</div></div></div>}{selected.meta && <div className="reasoningMeta">{selected.meta}</div>}
          {stage === "时序" && <div className="timelinePlayback">
            {audioSrc ? <audio ref={audioRef} src={audioSrc} controls preload="metadata" /> : <div className="noAudioNotice">该接待没有关联录音文件，可查看对应ASR转写但无法播放。</div>}
            <div className="buttonRow"><button className="primary" onClick={() => playAt(selected.atSec)} disabled={selected.atSec == null || !audioSrc}><Icon name="play" />播放此片段</button><button onClick={() => linkedTranscriptRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })} disabled={!selected.transcript?.length}>查看对应转写（{selected.transcript?.length || 0}句）</button></div>
            {playerStatus && <small className="playerStatus">{playerStatus}</small>}
            <div className="timelineTranscript" ref={linkedTranscriptRef}>
              <strong>录音与ASR原文</strong>
              {selected.transcript?.length ? selected.transcript.map((row) => <button key={row.id} onClick={() => playAt(row.startSec)}><span>{formatTime(row.startSec)}</span><b>{formatChineseLabel(row.role)}</b><p>{row.text}</p><Icon name="play" /></button>) : <span className="emptyEvidence">该时序事件没有可定位的ASR句子。</span>}
            </div>
          </div>}
          {stage !== "时序" && <><h4>原文证据</h4><EvidenceList evidence={selected.evidence} emptyText="该项没有可回溯证据，需人工复核。" /></>}</>}
      </div>
    </div>
  </section>;
}

function buildTimelineReasoningItem(item: any, semantic: any, analysis: Analysis, transcript: TranscriptUtterance[]) {
  const segment = (semantic.segments || []).find((row: any) => row.id === item.refId);
  const diagnosis = analysis.diagnoses.find((row) => row.id === item.refId);
  const strategy = analysis.strategies.find((row) => row.id === item.refId);
  const evidence = diagnosis?.evidence || strategy?.evidenceToShow || [];
  const evidenceSecond = parseDisplayTimestamp(evidence[0]?.timestamp);
  const atSec = item.atSec != null ? Number(item.atSec) : evidenceSecond;
  let linkedTranscript = segment
    ? transcript.filter((row) => (segment.utteranceIds || []).includes(row.id))
    : Number.isFinite(atSec)
      ? transcript.filter((row) => row.startSec <= atSec + 8 && row.endSec >= atSec - 2).slice(0, 8)
      : [];
  if (!linkedTranscript.length && evidence.length) {
    const quotes = new Set(evidence.map((row) => row.quote));
    linkedTranscript = transcript.filter((row) => quotes.has(row.text)).slice(0, 8);
  }
  const transcriptEvidence = linkedTranscript.map((row) => ({ timestamp: formatTime(row.startSec), speaker: row.role, quote: row.text, type: "ASR转写" }));
  return {
    title: strategy ? `${strategy.issue}的跟进策略` : item.title,
    text: describeTimelineEvent(item, segment, linkedTranscript, diagnosis, strategy),
    meta: `关联对象：${formatTimelineObject(item, semantic, analysis)}`,
    evidence: transcriptEvidence.length ? transcriptEvidence : evidence,
    atSec: Number.isFinite(atSec) ? atSec : null,
    transcript: linkedTranscript
  };
}

function describeTimelineEvent(item: any, segment: any, transcript: TranscriptUtterance[], diagnosis?: DiagnosisResult, strategy?: StrategyResult) {
  if (diagnosis) return `诊断说明：${diagnosis.reason || diagnosis.category || "规则命中"}`;
  if (strategy) return `行动建议：${strategy.nextBestAction}`;
  if (!segment) return item.type || "分析事件";
  const fullText = transcript.map((row) => row.text).join("；");
  const topics = timelineTopicLabels(fullText);
  const topicText = topics.length ? topics.join("、") : truncateText(fullText, 44);
  if (/异议/.test(segment.segmentType)) return `客户提出或确认的异议：${topicText || "请查看对应原话"}`;
  if (/产品|讲解|沟通/.test(segment.segmentType)) return `本段介绍或讨论：${topicText || "产品功能、配置与使用方式"}`;
  if (/体验|试驾/.test(segment.segmentType)) return `本段体验推进：${topicText || "试驾安排与体验关注点"}`;
  if (/报价|议价|金融/.test(segment.segmentType)) return `本段价格沟通：${topicText || "报价、首付、贷款或权益"}`;
  if (/跟进|闭环/.test(segment.segmentType)) return `本段跟进沟通：${topicText || "后续联系或复店安排"}`;
  return `本段关键信息：${topicText || "查看对应ASR原文"}`;
}

function timelineTopicLabels(text: string) {
  const dictionary: Array<[RegExp, string]> = [
    [/激光雷达/, "激光雷达"], [/座椅.*(按摩|通风|加热)/, "座椅舒适功能"], [/音响/, "音响系统"],
    [/外放电|放电枪/, "外放电方式"], [/插座/, "车内插座"], [/前备箱/, "前备箱"], [/空间|轴距|尺寸/, "空间与尺寸"],
    [/续航|增程|纯电/, "续航与动力形式"], [/轮毂|轮胎|卡钳/, "轮毂与制动配置"], [/价格|落地|贵|优惠/, "价格与优惠"],
    [/贷款|首付|利息|金融/, "金融方案"], [/现车|库存|交付/, "现车与交付"], [/试驾/, "试驾安排"], [/竞品|零跑|C11/, "竞品比较"]
  ];
  return dictionary.filter(([pattern]) => pattern.test(text)).map(([, label]) => label).slice(0, 5);
}

function formatTimelineObject(item: any, semantic: any, analysis: Analysis) {
  const segment = (semantic.segments || []).find((row: any) => row.id === item.refId);
  if (segment) return `第${segment.sequence}个会话片段（${segment.segmentType}）`;
  const fact = (semantic.facts || []).find((row: any) => row.id === item.refId);
  if (fact) return `洞察事实：${fact.name}`;
  const diagnosis = analysis.diagnoses.find((row) => row.id === item.refId);
  if (diagnosis) return `诊断问题：${diagnosis.issue}`;
  const strategy = analysis.strategies.find((row) => row.id === item.refId);
  if (strategy) return `策略建议：${strategy.issue}`;
  if (item.type === "反馈结果") return `反馈事件：${item.title}`;
  return "当前接待分析事件";
}

function parseDisplayTimestamp(value?: string) {
  if (!value) return Number.NaN;
  const match = value.match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

type GraphNode = { id: string; type: string; label: string; detail: string; evidence?: Evidence[]; level: number; count?: number };
type GraphEdge = { source: string; target: string; label: string };
const GRAPH_NODE_WIDTH = 216;
const GRAPH_NODE_HEIGHT = 72;
const GRAPH_NODE_HALF = GRAPH_NODE_WIDTH / 2;

function SemanticGraphPage({ detail }: { detail: SessionDetail | null }) {
  const [filter, setFilter] = useState("全部");
  const [selectedId, setSelectedId] = useState("");
  const [hoveredId, setHoveredId] = useState("");
  const [expandedSegments, setExpandedSegments] = useState(false);
  if (!detail) return <EmptyState title="未选择接待" text="请先选择一条接待记录。" />;
  if (!detail.analysis) return <EmptyState title="尚无语义图谱" text="完成事实层分析后，系统会使用真实事实、诊断和策略生成图谱。" />;
  const graph = buildSemanticGraph(detail, expandedSegments);
  const allowedTypes = graphFilterTypes(filter, graph.nodes);
  const nodes = allowedTypes ? graph.nodes.filter((node) => allowedTypes.has(node.type) || node.type === "接待会话") : graph.nodes;
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const positions = layoutGraphNodes(nodes);
  const selected = nodes.find((node) => node.id === selectedId) || nodes[0];
  const connected = selected ? edges.filter((edge) => edge.source === selected.id || edge.target === selected.id) : [];
  const focusId = hoveredId || selected?.id || "";
  const focusEdges = focusId ? edges.filter((edge) => edge.source === focusId || edge.target === focusId) : [];
  const neighborIds = new Set(focusEdges.flatMap((edge) => [edge.source, edge.target]));
  const height = Math.max(560, ...Array.from(positions.values()).map((item) => item.y + GRAPH_NODE_HEIGHT + 30));
  const width = Math.max(1240, ...Array.from(positions.values()).map((item) => item.x + GRAPH_NODE_HALF + 36));
  return <section className="graphPage">
    <div className="panel full">
      <div className="sectionTitle"><h2>语义图谱视图</h2><span>{detail.session.reception_no} · 仅展示当前真实会话形成的实体和关系</span></div>
      <div className="graphToolbar">{["全部", "客户事实", "销售行为", "时序证据", "诊断策略", "冲突复核"].map((item) => <button className={filter === item ? "active" : ""} onClick={() => { setFilter(item); setSelectedId(""); }} key={item}>{item}</button>)}<button onClick={() => { setExpandedSegments((value) => !value); setSelectedId(""); }}>{expandedSegments ? "聚合会话片段" : `展开${(detail.analysis.semanticPackage?.segments || []).length}个会话片段`}</button></div>
      <div className="graphLegend"><span className="session">接待会话</span><span className="entity">客户与实体事实</span><span className="salesAction">销售行为事实</span><span className="diagnosis">诊断层</span><span className="strategy">策略层</span><span className="generation">生成层</span></div>
    </div>
    <div className="graphLayout">
      <div className="panel graphViewport">
        <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: `${width}px` }} role="img" aria-label="当前接待语义关系图" onMouseLeave={() => setHoveredId("")}>
          <defs>
            <marker id="graphArrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker>
            <marker id="graphArrowActive" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 z" /></marker>
          </defs>
          {edges.map((edge, index) => {
            const a = positions.get(edge.source); const b = positions.get(edge.target); if (!a || !b) return null;
            const active = focusId && (edge.source === focusId || edge.target === focusId);
            const muted = Boolean(focusId && !active);
            const startX = a.x + GRAPH_NODE_HALF; const startY = a.y + GRAPH_NODE_HEIGHT / 2; const endX = b.x - GRAPH_NODE_HALF; const endY = b.y + GRAPH_NODE_HEIGHT / 2;
            const curve = Math.max(28, (endX - startX) * 0.42);
            return <g key={`${edge.source}-${edge.target}-${index}`} className={`graphEdge ${active ? "active" : ""} ${muted ? "muted" : ""}`}>
              <path d={`M ${startX} ${startY} C ${startX + curve} ${startY}, ${endX - curve} ${endY}, ${endX} ${endY}`} markerEnd={active ? "url(#graphArrowActive)" : "url(#graphArrow)"} />
              <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 7} textAnchor="middle" className="graphEdgeLabel">{edge.label}</text>
            </g>;
          })}
          {nodes.map((node) => {
            const p = positions.get(node.id)!;
            const labelLines = wrapGraphLabel(node.label);
            const isSelected = selected?.id === node.id;
            const isFocused = focusId === node.id;
            const isNeighbor = Boolean(focusId && neighborIds.has(node.id) && !isFocused);
            const isMuted = Boolean(focusId && !neighborIds.has(node.id));
            return <g key={node.id} className={`graphNode graphNode-${graphNodeTone(node.type)} ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""} ${isNeighbor ? "neighbor" : ""} ${isMuted ? "muted" : ""}`} onMouseEnter={() => setHoveredId(node.id)} onFocus={() => setHoveredId(node.id)} onBlur={() => setHoveredId("")} onClick={() => setSelectedId(node.id)} role="button" tabIndex={0} aria-label={`${node.type}：${node.label}`}>
              <rect x={p.x - GRAPH_NODE_HALF} y={p.y} width={GRAPH_NODE_WIDTH} height={GRAPH_NODE_HEIGHT} rx="7" />
              <circle className="graphNodeDot" cx={p.x - GRAPH_NODE_HALF + 16} cy={p.y + 16} r="4" />
              <text x={p.x} y={p.y + 20} textAnchor="middle" className="graphNodeType">{node.type}</text>
              <text x={p.x} y={labelLines.length === 1 ? p.y + 51 : p.y + 43} textAnchor="middle" className="graphNodeLabel">
                {labelLines.map((line, index) => <tspan key={`${node.id}-line-${index}`} x={p.x} dy={index === 0 ? 0 : 17}>{line}</tspan>)}
              </text>
            </g>;
          })}
        </svg>
      </div>
      <aside className="panel graphInspector"><div className="sectionTitle"><h2>节点详情</h2><span>{connected.length}条关联</span></div>
        {selected && <><StatusChip label={selected.type} tone={selected.type.includes("诊断") || selected.type.includes("冲突") ? "amber" : selected.type.includes("策略") ? "teal" : "blue"} /><h3>{selected.label}</h3><p>{selected.detail}</p><h4>关联关系</h4><div className="relationList">{connected.map((edge, index) => <span key={index}>{edge.source === selected.id ? `本节点 ${edge.label} ${graph.nodes.find((node) => node.id === edge.target)?.label || "关联节点"}` : `${graph.nodes.find((node) => node.id === edge.source)?.label || "关联节点"} ${edge.label} 本节点`}</span>)}</div>{selected.evidence?.length ? <details className="graphEvidenceDetails"><summary>查看形成该节点的原文证据（{selected.evidence.length}条）</summary><p>原文证据用于解释事实和规则结论，并支持人工复核，不再作为独立节点铺满图谱。</p><EvidenceList evidence={selected.evidence} emptyText="该节点暂无可展示的原文证据。" /></details> : <p className="graphEvidenceHint">该节点是业务对象或配置结果，不需要单独展示原文证据。</p>}</>}
      </aside>
    </div>
  </section>;
}

function graphNodeTone(type: string) {
  if (type === "接待会话") return "session";
  if (type === "客户") return "customer";
  if (type === "销售") return "sales";
  if (type === "会话片段" || type === "原文证据") return "evidence";
  if (type === "诊断问题" || type === "事实冲突") return "diagnosis";
  if (type === "策略" || type === "决策策略") return "strategy";
  if (type === "生成卡片") return "generation";
  if (/销售|推进|讲解/.test(type)) return "salesaction";
  if (/客户|场景|需求|购买|异议/.test(type)) return "customerfact";
  return "fact";
}

function replaceAt<T>(items: T[], index: number, value: T) { return items.map((item, itemIndex) => itemIndex === index ? value : item); }

function ontoEntityForField(item: any) {
  const text = `${item.category || ""} ${item.field || ""} ${item.meaning || ""}`;
  if (/场景/.test(text)) return "接待会话 / 会话片段";
  if (/客户.*异议|异议/.test(text)) return "客户异议 / 洞察事实";
  if (/客户|需求|购买|阻塞/.test(text)) return "客户 / 客户需求 / 洞察事实";
  if (/销售.*推进|跟进/.test(text)) return "销售动作 / 干预动作";
  if (/销售/.test(text)) return "销售 / 销售动作 / 洞察事实";
  return "洞察事实 / 原文证据";
}

function buildSemanticGraph(detail: SessionDetail, expandedSegments = false): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const analysis = detail.analysis!;
  const runtime = analysis.semanticPackage;
  if (runtime?.graph?.nodes?.length) {
    const evidence = Array.isArray(runtime.evidence) ? runtime.evidence : [];
    const provenance = Array.isArray(runtime.provenance) ? runtime.provenance : [];
    const rawNodes = runtime.graph.nodes as Array<any>;
    const rawSegments = rawNodes.filter((item) => item.type === "会话片段");
    const segmentMap = new Map<string, string>();
    const segmentGroups = new Map<string, Array<any>>();
    rawSegments.forEach((item) => {
      const label = String(item.label || "会话片段").replace(/^\d+\.\s*/, "");
      const groupId = `segment-group:${label}`;
      segmentMap.set(item.id, expandedSegments ? item.id : groupId);
      segmentGroups.set(label, [...(segmentGroups.get(label) || []), item]);
    });
    const nodes: GraphNode[] = rawNodes.filter((item) => item.type !== "原文证据" && (expandedSegments || item.type !== "会话片段")).map((item) => {
      const ownEvidence = evidence.filter((row: any) => provenance.some((trace: any) => trace.targetId === item.id && trace.sourceId === row.id));
      return {
        id: item.id,
        type: item.type,
        label: item.label,
        detail: `状态：${item.status || "已形成"}`,
        evidence: ownEvidence.map(runtimeEvidenceToEvidence),
        level: runtimeGraphLevel(item.type)
      };
    });
    if (!expandedSegments) segmentGroups.forEach((items, label) => {
      const segmentIds = new Set(items.map((item) => item.id));
      nodes.push({ id: `segment-group:${label}`, type: "会话片段", label: `${label}（${items.length}段）`, detail: `已将${items.length}个“${label}”片段聚合展示，可点击上方按钮展开逐段查看。`, evidence: evidence.filter((row: any) => segmentIds.has(row.segmentId)).map(runtimeEvidenceToEvidence).slice(0, 12), level: 1, count: items.length });
    });
    analysis.generatedCards.forEach((item) => nodes.push({ id: `card:${item.id}`, type: "生成卡片", label: item.title, detail: item.content, evidence: item.evidence, level: 6 }));
    const ids = new Set(nodes.map((item) => item.id));
    const rawEdges = (runtime.graph.edges as Array<any>).map((item) => ({ source: segmentMap.get(item.source) || item.source, target: segmentMap.get(item.target) || item.target, label: item.relation }));
    const salesId = nodes.find((item) => item.type === "销售")?.id;
    const customerId = nodes.find((item) => item.type === "客户")?.id;
    if (salesId) nodes.filter((item) => /销售行为|销售动作/.test(item.type)).forEach((item) => rawEdges.push({ source: salesId, target: item.id, label: "执行" }));
    if (customerId) nodes.filter((item) => /客户行为|客户需求|客户异议/.test(item.type)).forEach((item) => rawEdges.push({ source: customerId, target: item.id, label: "表达" }));
    analysis.generatedCards.forEach((card) => {
      const cardId = `card:${card.id}`;
      const source = nodes.find((item) => item.type === "决策策略" || item.type === "策略")?.id || nodes.find((item) => item.type === "诊断问题")?.id;
      if (source) rawEdges.push({ source, target: cardId, label: "生成" });
    });
    const edgeKeys = new Set<string>();
    const edges = rawEdges.filter((item) => ids.has(item.source) && ids.has(item.target) && item.source !== item.target).filter((item) => { const key = `${item.source}|${item.target}|${item.label}`; if (edgeKeys.has(key)) return false; edgeKeys.add(key); return true; });
    return { nodes, edges };
  }
  const fact = analysis.factPackage || {};
  const nodes: GraphNode[] = [{ id: "session", type: "接待会话", label: detail.session.reception_no, detail: `${detail.session.store} · ${detail.session.salesperson}`, level: 0 }];
  const edges: GraphEdge[] = [];
  nodes.push({ id: "customer", type: "客户", label: detail.session.customer_name || "临时客户", detail: "本次接待主客户", level: 1 });
  nodes.push({ id: "sales", type: "销售", label: detail.session.salesperson, detail: `录音工牌绑定销售 · ${detail.session.store}`, level: 1 });
  edges.push({ source: "session", target: "customer", label: "包含" }, { source: "session", target: "sales", label: "包含" });
  const evidence = normalizeEvidenceList(fact.evidence);
  const profile = fact.customerProfile || {};
  const products = toTextList(profile.productsDiscussed || profile.products || fact.productsDiscussed);
  products.slice(0, 4).forEach((value, index) => { const id = `product-${index}`; nodes.push({ id, type: "车型", label: value, detail: "对话中明确提及的车型或产品", evidence: findEvidence(evidence, value), level: 2 }); edges.push({ source: "customer", target: id, label: "讨论" }); });
  const needs = [...toTextList(profile.useCase), ...toTextList(fact.customerTags?.concerns)].filter((value) => value && value !== "未提及");
  [...new Set(needs)].slice(0, 6).forEach((value, index) => { const id = `need-${index}`; nodes.push({ id, type: "客户需求", label: value, detail: "事实层抽取的客户需求或关注点", evidence: findEvidence(evidence, value), level: 2 }); edges.push({ source: "customer", target: id, label: "表达" }); });
  const objections = toTextList(fact.customerTags?.objections).filter((value) => value && value !== "未提及");
  objections.slice(0, 5).forEach((value, index) => { const id = `objection-${index}`; nodes.push({ id, type: "客户异议", label: value, detail: "事实层抽取的客户异议", evidence: findEvidence(evidence, value), level: 2 }); edges.push({ source: "customer", target: id, label: "提出" }); });
  Object.entries(fact.sopActions || {}).filter(([, value]) => Boolean(value)).slice(0, 7).forEach(([key], index) => { const id = `action-${index}`; const label = sopLabel(key); nodes.push({ id, type: "销售动作", label, detail: "事实层确认销售实际完成的动作", evidence: getSopActionEvidence(fact, key, true), level: 2 }); edges.push({ source: "sales", target: id, label: "执行" }); });
  analysis.diagnoses.slice(0, 8).forEach((item, index) => { const id = `diagnosis-${item.id || index}`; nodes.push({ id, type: "诊断问题", label: item.issue, detail: `${item.riskLevel} · ${item.reason || "规则命中"}`, evidence: item.evidence, level: 3 }); const source = nodes.find((node) => node.level === 2 && findEvidence(item.evidence || [], node.label).length)?.id || "sales"; edges.push({ source, target: id, label: "触发" }); });
  analysis.strategies.slice(0, 8).forEach((item, index) => { const id = `strategy-${item.id || index}`; nodes.push({ id, type: "策略", label: item.nextBestAction || item.issue, detail: `${item.timing || "待配置"} · ${item.channel || "待配置"}`, evidence: item.evidenceToShow, level: 4 }); const diagnosis = analysis.diagnoses.find((row) => row.id === item.diagnosisId); const source = diagnosis ? `diagnosis-${diagnosis.id}` : nodes.find((node) => node.type === "诊断问题")?.id; if (source) edges.push({ source, target: id, label: "匹配" }); });
  return { nodes, edges };
}

function graphFilterTypes(filter: string, nodes: GraphNode[]) {
  if (filter === "全部") return null;
  if (filter === "时序证据") return new Set(["会话片段", "原文证据"]);
  if (filter === "诊断策略") return new Set(["诊断问题", "策略", "决策策略", "生成卡片"]);
  if (filter === "冲突复核") return new Set(["事实冲突"]);
  if (filter === "销售行为") return new Set(nodes.filter((item) => /销售|动作|推进|讲解/.test(item.type)).map((item) => item.type));
  return new Set(nodes.filter((item) => /客户|场景|洞察事实|需求|购买|异议/.test(item.type)).map((item) => item.type));
}

function runtimeGraphLevel(type: string) {
  if (type === "接待会话") return 0;
  if (type === "客户" || type === "销售") return 1;
  if (type === "会话片段") return 1;
  if (type === "原文证据") return 2;
  if (type === "诊断问题") return 4;
  if (type === "决策策略" || type === "策略") return 5;
  if (type === "生成卡片") return 6;
  if (type === "事实冲突") return 4;
  return 3;
}

function runtimeEvidenceToEvidence(item: any): Evidence {
  return { timestamp: item.timestamp || "", speaker: item.speaker || "未知角色", quote: item.quote || "", type: item.evidenceType || "原文证据" };
}

function layoutGraphNodes(nodes: GraphNode[]) {
  const map = new Map<string, { x: number; y: number }>();
  const groups = new Map<number, GraphNode[]>();
  nodes.forEach((node) => groups.set(node.level, [...(groups.get(node.level) || []), node]));
  groups.forEach((items, level) => items.forEach((node, index) => map.set(node.id, { x: 126 + level * 258, y: 36 + index * 104 })));
  return map;
}

function wrapGraphLabel(value: string, maxChars = 13, maxLines = 2) {
  const normalized = String(value || "未命名节点").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return [normalized];
  const lines: string[] = [];
  let rest = normalized;
  while (rest && lines.length < maxLines) {
    if (rest.length <= maxChars) {
      lines.push(rest);
      rest = "";
      break;
    }
    const window = rest.slice(0, maxChars + 1);
    const breakAt = Math.max(window.lastIndexOf("，"), window.lastIndexOf("、"), window.lastIndexOf(" "));
    const length = breakAt >= Math.floor(maxChars * 0.55) ? breakAt + 1 : maxChars;
    lines.push(rest.slice(0, length).trim());
    rest = rest.slice(length).trim();
  }
  if (rest && lines.length) lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[，、 ]+$/, "")}…`;
  return lines;
}

function toTextList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(toTextList);
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).flatMap(toTextList);
  if (value == null) return [];
  return String(value).split(/[、,，;；]/).map((item) => item.trim()).filter(Boolean);
}

function findEvidence(evidence: Evidence[] | undefined, keyword: string) { const list = normalizeEvidenceList(evidence); return list.filter((item) => item.quote.includes(keyword) || String(item.type || "").includes(keyword)).slice(0, 6); }
function truncateText(value: string, length: number) { return value.length > length ? `${value.slice(0, length)}…` : value; }

function ConfigPage({ config, onSave, managerWechatConfig, onSaveManagerWechat, onTestManagerWechat, loading }: {
  config: AnalysisConfig | null;
  onSave: (config: AnalysisConfig) => void;
  managerWechatConfig: ManagerWechatConfigStatus | null;
  onSaveManagerWechat: (payload: Record<string, string | boolean>) => void;
  onTestManagerWechat: () => void;
  loading: boolean;
}) {
  const [draft, setDraft] = useState<AnalysisConfig | null>(null);
  const [activeLayer, setActiveLayer] = useState<ConfigLayerKey>("factLayer");

  useEffect(() => {
    if (!config) return;
    setDraft(config);
  }, [config]);

  if (!draft) {
    return <EmptyState title="配置读取中" text="正在读取五层分析配置。" />;
  }

  function updateLayer(layer: ConfigLayerKey, value: Record<string, any>) {
    setDraft((current) => (current ? { ...current, [layer]: value } : current));
  }

  function saveAll() {
    if (!draft) return;
    onSave(draft);
  }

  const layer = (draft[activeLayer] || {}) as Record<string, any>;
  const activeMeta = configLayerTabs.find((item) => item.key === activeLayer)!;
  const activeSaveLabel = `保存${activeMeta.title}`;

  return (
    <section className="configWorkbench">
      <div className="panel full">
        <div className="sectionTitle">
          <h2>分层配置中心</h2>
          <span>事实层由模型抽取；诊断、策略、生成、反馈全部按配置执行。系统不使用模型分数字段。</span>
        </div>
        <div className="configStats">
          <Metric label="事实字段" value={draft.factLayer?.fields?.length ?? 0} />
          <Metric label="诊断规则" value={draft.diagnosisLayer?.rules?.length ?? 0} />
          <Metric label="策略库" value={draft.strategyLayer?.strategies?.length ?? 0} />
          <Metric label="生成规范" value={Object.keys(draft.generationLayer?.specs || {}).length} />
          <Metric label="反馈角色" value={draft.feedbackLayer?.actors?.length ?? 0} />
        </div>
        <div className="configTabsBar">
          <div className="configTabs">
            {configLayerTabs.map((item) => (
              <button key={item.key} className={activeLayer === item.key ? "active" : ""} onClick={() => setActiveLayer(item.key)}>
                {item.title}
              </button>
            ))}
          </div>
          <button className="primary" onClick={saveAll} disabled={loading}>
            <Icon name="save" />
            保存全部五层配置
          </button>
        </div>
      </div>

      <div className="panel layerConfigPanel">
        <div className="sectionTitle">
          <h2>{activeMeta.title}</h2>
          <span>{activeMeta.effect}</span>
        </div>
        <div className="layerSaveBar">
          <div>
            <strong>{activeMeta.title}</strong>
            <span>修改后请保存；保存成功后，重新分析或刷新下游结果才会按新配置执行。</span>
          </div>
          <button className="primary" onClick={saveAll} disabled={loading}>
            <Icon name="save" />
            {activeSaveLabel}
          </button>
        </div>
        {activeLayer === "factLayer" && <FactLayerEditor layer={layer} onChange={(value) => updateLayer("factLayer", value)} />}
        {activeLayer === "diagnosisLayer" && <DiagnosisLayerEditor layer={layer} onChange={(value) => updateLayer("diagnosisLayer", value)} />}
        {activeLayer === "strategyLayer" && <StrategyLayerEditor layer={layer} onChange={(value) => updateLayer("strategyLayer", value)} />}
        {activeLayer === "generationLayer" && <GenerationLayerEditor layer={layer} onChange={(value) => updateLayer("generationLayer", value)} managerWechatConfig={managerWechatConfig} onSaveManagerWechat={onSaveManagerWechat} onTestManagerWechat={onTestManagerWechat} loading={loading} />}
        {activeLayer === "feedbackLayer" && <FeedbackLayerEditor layer={layer} onChange={(value) => updateLayer("feedbackLayer", value)} />}
      </div>

      <div className="panel advancedConfigPanel">
        <div className="layerSaveFooter">
          <span>当前正在编辑：{activeMeta.title}</span>
          <div className="buttonRow endActions">
            <button onClick={saveAll} disabled={loading}>
              <Icon name="save" />
              保存全部五层配置
            </button>
          <button className="primary" onClick={saveAll} disabled={loading}>
            <Icon name="save" />
              {activeSaveLabel}
          </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function FactLayerEditor({ layer, onChange }: { layer: Record<string, any>; onChange: (value: Record<string, any>) => void }) {
  const fields = Array.isArray(layer.fields) ? layer.fields : [];
  const model = layer.model || {};
  const updateField = (index: number, patch: Record<string, any>) => onChange({ ...layer, fields: fields.map((item: any, i: number) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <div className="configSection">
      <div className="formGrid two">
        <label>
          行业口径
          <input value={layer.industry || ""} onChange={(event) => onChange({ ...layer, industry: event.target.value })} />
        </label>
        <label>
          字段来源
          <input value={layer.schemaSource || ""} onChange={(event) => onChange({ ...layer, schemaSource: event.target.value })} />
        </label>
      </div>
      <div className="formGrid two">
        <label>
          模型提供方
          <select value={model.provider || "poc-local"} onChange={(event) => onChange({ ...layer, model: { ...model, provider: event.target.value, allowLocalExtractor: event.target.value === "poc-local" } })}>
            <option value="poc-local">内置事实抽取器</option>
            <option value="openai-compatible">兼容接口大模型</option>
          </select>
        </label>
        <label className="check inlineCheck">
          <input type="checkbox" checked={model.enabled !== false} onChange={(event) => onChange({ ...layer, model: { ...model, enabled: event.target.checked } })} />
          启用事实层执行器
        </label>
      </div>
      <label className="textareaLabel">
        全局系统提示词
        <textarea value={layer.systemPrompt || ""} onChange={(event) => onChange({ ...layer, systemPrompt: event.target.value })} rows={6} />
      </label>
      <small className="fieldHelp">定义所有字段共同遵守的角色边界、事实边界和证据要求，每通录音只使用一次。</small>
      <label className="textareaLabel">
        单次抽取任务提示词
        <textarea value={layer.userPromptTemplate || ""} onChange={(event) => onChange({ ...layer, userPromptTemplate: event.target.value })} rows={4} />
      </label>
      <small className="fieldHelp">系统会把转写文本替换到“转写文本”占位符，并将下方7个字段提示词一起发送给模型。</small>
      <div className="configToolbar">
        <div>
          <strong>7个事实字段提示词</strong>
          <small className="fieldHelp">每个字段配置一条边界清晰的提示词；7个字段合并为一次请求，不会分别调用模型。</small>
        </div>
        <button onClick={() => onChange({ ...layer, fields: [...fields, newFactField(fields.length)] })}>新增字段</button>
      </div>
      <div className="configItemList">
        {fields.map((item: any, index: number) => (
          <article key={`${item.key}-${index}`} className="configItem">
            <div className="configItemHead">
              <h3>{index + 1}. {item.field || "未命名事实字段"}</h3>
              <label className="check">
                <input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateField(index, { enabled: event.target.checked })} />
                启用
              </label>
              <ConfigRowActions
                onUp={() => onChange({ ...layer, fields: moveItem(fields, index, -1) })}
                onDown={() => onChange({ ...layer, fields: moveItem(fields, index, 1) })}
                onCopy={() => onChange({ ...layer, fields: duplicateItem(fields, index) })}
                onDelete={() => onChange({ ...layer, fields: fields.filter((_: any, i: number) => i !== index) })}
              />
            </div>
            <div className="formGrid two">
              <label>字段名<input value={item.field || ""} onChange={(event) => updateField(index, { field: event.target.value })} /></label>
              <label>分类<input value={item.category || ""} onChange={(event) => updateField(index, { category: event.target.value })} /></label>
            </div>
            <label className="textareaLabel">字段含义<textarea value={item.meaning || ""} onChange={(event) => updateField(index, { meaning: event.target.value })} rows={2} /></label>
            <label className="textareaLabel">字段抽取提示词<textarea value={item.modelPrompt || ""} onChange={(event) => updateField(index, { modelPrompt: event.target.value.replace(/confidence|置信度/gi, "") })} rows={4} /></label>
            <label className="textareaLabel">输出内容要求<textarea value={item.outputRequirement || ""} onChange={(event) => updateField(index, { outputRequirement: event.target.value.replace(/confidence|置信度/gi, "") })} rows={2} /></label>
            <label className="textareaLabel">可选值约束<textarea value={item.allowedValues || ""} onChange={(event) => updateField(index, { allowedValues: event.target.value.replace(/confidence|置信度/gi, "") })} rows={2} placeholder="没有固定枚举时可以留空" /></label>
            <label className="check"><input type="checkbox" checked={item.requiresEvidence !== false} onChange={(event) => updateField(index, { requiresEvidence: event.target.checked })} />必须带原文证据</label>
          </article>
        ))}
      </div>
    </div>
  );
}

function DiagnosisLayerEditor({ layer, onChange }: { layer: Record<string, any>; onChange: (value: Record<string, any>) => void }) {
  const rules = Array.isArray(layer.rules) ? layer.rules : [];
  const checkObjects = getCheckObjects(layer, []);
  const updateRule = (index: number, patch: Record<string, any>) => onChange({ ...layer, rules: rules.map((item: any, i: number) => (i === index ? { ...item, ...patch } : item)) });
  const updateCheckObject = (index: number, patch: Partial<CheckObject>) => onChange({ ...layer, checkObjects: checkObjects.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <div className="configSection">
      <label className="textareaLabel">诊断说明<textarea value={layer.description || ""} onChange={(event) => onChange({ ...layer, description: event.target.value })} rows={2} /></label>
      <div className="configToolbar">
        <strong>检查对象库</strong>
        <button onClick={() => onChange({ ...layer, checkObjects: [newCheckObject(checkObjects.length), ...checkObjects] })}>新增检查对象</button>
      </div>
      <div className="configItemList compactConfigList">
        {checkObjects.map((item, index) => (
          <article key={`${item.code}-${index}`} className="configItem">
            <div className="configItemHead">
              <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateCheckObject(index, { enabled: event.target.checked })} />启用</label>
              <ConfigRowActions
                onUp={() => onChange({ ...layer, checkObjects: moveItem(checkObjects, index, -1) })}
                onDown={() => onChange({ ...layer, checkObjects: moveItem(checkObjects, index, 1) })}
                onCopy={() => onChange({ ...layer, checkObjects: duplicateItem(checkObjects as any[], index) })}
                onDelete={() => onChange({ ...layer, checkObjects: checkObjects.filter((_, i) => i !== index) })}
              />
            </div>
            <div className="formGrid two">
              <label>对象名称<input value={item.name || ""} onChange={(event) => updateCheckObject(index, { name: event.target.value })} /></label>
              <label>对象类型<select value={item.type || "SOP动作"} onChange={(event) => updateCheckObject(index, { type: event.target.value })}>
                <option>SOP动作</option>
                <option>客户画像</option>
                <option>客户异议</option>
                <option>销售行为质量</option>
                <option>风险红线</option>
              </select></label>
            </div>
            <label className="textareaLabel">大模型字段含义<textarea value={item.llmMeaning || ""} onChange={(event) => updateCheckObject(index, { llmMeaning: event.target.value })} rows={2} /></label>
            <div className="formGrid two">
              <label className="textareaLabel">判断口径<textarea value={item.judgmentRule || ""} onChange={(event) => updateCheckObject(index, { judgmentRule: event.target.value })} rows={2} /></label>
              <label className="textareaLabel">证据要求<textarea value={item.evidenceRequirement || ""} onChange={(event) => updateCheckObject(index, { evidenceRequirement: event.target.value })} rows={2} /></label>
            </div>
          </article>
        ))}
      </div>
      <div className="configToolbar">
        <strong>销售接待问题库</strong>
        <button onClick={() => onChange({ ...layer, rules: [newDiagnosisRule(rules.length), ...rules] })}>新增规则</button>
      </div>
      <div className="configItemList">
        {rules.map((item: any, index: number) => (
          <article key={`${item.ruleId}-${index}`} className="configItem">
            <div className="configItemHead">
              <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateRule(index, { enabled: event.target.checked })} />启用</label>
              <ConfigRowActions
                onUp={() => onChange({ ...layer, rules: moveItem(rules, index, -1) })}
                onDown={() => onChange({ ...layer, rules: moveItem(rules, index, 1) })}
                onCopy={() => onChange({ ...layer, rules: duplicateItem(rules, index) })}
                onDelete={() => onChange({ ...layer, rules: rules.filter((_: any, i: number) => i !== index) })}
              />
            </div>
            <div className="formGrid three">
              <label>问题名称<input value={item.issue || ""} onChange={(event) => updateRule(index, { issue: event.target.value })} /></label>
              <label>问题分类<input value={item.category || ""} onChange={(event) => updateRule(index, { category: event.target.value })} /></label>
              <label>风险等级<select value={item.riskLevel || "中"} onChange={(event) => updateRule(index, { riskLevel: event.target.value })}><option>高</option><option>中高</option><option>中</option><option>低</option></select></label>
            </div>
            <div className="formGrid three">
              <ConditionTypeField value={item.conditionType || "missing_sop"} onChange={(value) => updateRule(index, { conditionType: value })} />
              <ConditionFieldSelect value={item.conditionField || ""} checkObjects={checkObjects} onChange={(value) => updateRule(index, { conditionField: value, evidenceSelector: item.evidenceSelector || value })} />
              <EvidenceSelectorSelect value={item.evidenceSelector || ""} checkObjects={checkObjects} onChange={(value) => updateRule(index, { evidenceSelector: value })} />
            </div>
            <RuleFieldHelp conditionType={item.conditionType || "missing_sop"} conditionField={item.conditionField || ""} evidenceSelector={item.evidenceSelector || ""} checkObjects={checkObjects} />
            <label className="textareaLabel">命中原因<textarea value={item.reason || ""} onChange={(event) => updateRule(index, { reason: event.target.value })} rows={2} /></label>
            <div className="buttonRow">
              <label className="check"><input type="checkbox" checked={item.recoverable !== false} onChange={(event) => updateRule(index, { recoverable: event.target.checked })} />可挽回</label>
              <label className="check"><input type="checkbox" checked={Boolean(item.manualReviewRequired)} onChange={(event) => updateRule(index, { manualReviewRequired: event.target.checked })} />需要人工复核</label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function StrategyLayerEditor({ layer, onChange }: { layer: Record<string, any>; onChange: (value: Record<string, any>) => void }) {
  const strategies = Array.isArray(layer.strategies) ? layer.strategies : [];
  const updateStrategy = (index: number, patch: Record<string, any>) => onChange({ ...layer, strategies: strategies.map((item: any, i: number) => (i === index ? { ...item, ...patch } : item)) });
  return (
    <div className="configSection">
      <label>未匹配策略处理<input value={layer.unmatchedPolicy || ""} onChange={(event) => onChange({ ...layer, unmatchedPolicy: event.target.value })} /></label>
      <div className="configToolbar">
        <strong>策略库</strong>
        <button onClick={() => onChange({ ...layer, strategies: [newStrategy(strategies.length), ...strategies] })}>新增策略</button>
      </div>
      <div className="configItemList">
        {strategies.map((item: any, index: number) => (
          <article key={`${item.strategyId}-${index}`} className="configItem">
            <div className="configItemHead">
              <label className="check"><input type="checkbox" checked={item.enabled !== false} onChange={(event) => updateStrategy(index, { enabled: event.target.checked })} />启用</label>
              <ConfigRowActions
                onUp={() => onChange({ ...layer, strategies: moveItem(strategies, index, -1) })}
                onDown={() => onChange({ ...layer, strategies: moveItem(strategies, index, 1) })}
                onCopy={() => onChange({ ...layer, strategies: duplicateItem(strategies, index) })}
                onDelete={() => onChange({ ...layer, strategies: strategies.filter((_: any, i: number) => i !== index) })}
              />
            </div>
            <div className="formGrid two">
              <label>分类<input value={item.category || ""} onChange={(event) => updateStrategy(index, { category: event.target.value })} /></label>
              <label>优先级<input type="number" value={Number(item.priority || 0)} onChange={(event) => updateStrategy(index, { priority: Number(event.target.value) })} /></label>
            </div>
            <label>绑定诊断问题<input value={(item.triggerIssues || []).join("、")} onChange={(event) => updateStrategy(index, { triggerIssues: splitText(event.target.value) })} /></label>
            <div className="formGrid three">
              <label>时间窗口<input value={item.timing || ""} onChange={(event) => updateStrategy(index, { timing: event.target.value })} /></label>
              <label>渠道<input value={item.channel || ""} onChange={(event) => updateStrategy(index, { channel: event.target.value })} /></label>
              <label className="check inlineCheck"><input type="checkbox" checked={Boolean(item.managerIntervention)} onChange={(event) => updateStrategy(index, { managerIntervention: event.target.checked })} />店长介入</label>
            </div>
            <label className="textareaLabel">下一步动作<textarea value={item.action || ""} onChange={(event) => updateStrategy(index, { action: event.target.value })} rows={2} /></label>
            <label>材料建议<input value={(item.materials || []).join("、")} onChange={(event) => updateStrategy(index, { materials: splitText(event.target.value) })} /></label>
          </article>
        ))}
      </div>
    </div>
  );
}

function ManagerWechatConfigPanel({ config, onSave, onTest, loading }: {
  config: ManagerWechatConfigStatus | null;
  onSave: (payload: Record<string, string | boolean>) => void;
  onTest: () => void;
  loading: boolean;
}) {
  const [userIds, setUserIds] = useState("");
  const [mobiles, setMobiles] = useState("");

  useEffect(() => {
    setUserIds("");
    setMobiles("");
  }, [config]);

  return (
    <section className="managerWechatConfig">
      <div className="configToolbar">
        <div>
          <strong>店长企业微信通知配置</strong>
          <small className="fieldHelp">三级客户预警由企业微信群机器人发送，并通过用户ID或手机号定向提醒店长。</small>
        </div>
        <span className={`configStatus ${config?.configured ? "ready" : "pending"}`}>{config?.configured ? "通知已配置" : "通知待配置"}</span>
      </div>
      <div className="logicNote">
        <strong>配置说明：</strong>机器人地址只能在服务端环境变量 <code>MANAGER_WECHAT_WEBHOOK</code> 中配置，页面不会读取、接收或回显地址。店长企业微信用户ID或绑定手机号至少填写一项。
      </div>
      <div className="formGrid two">
        <div className="logicNote">
          <strong>服务端状态：</strong>{config?.webhookSet ? "机器人地址已配置" : "机器人地址未配置"}；已配置通知对象 {config?.recipientCount || 0} 个。具体地址和通知对象均不会回显。
        </div>
        <label>
          店长企业微信用户ID
          <input value={userIds} onChange={(event) => setUserIds(event.target.value)} placeholder={config?.userIdsSet ? "已在服务端配置；留空表示不修改" : "多人用顿号分隔"} />
          <small className="fieldHelp">企业微信通讯录中的账号，不是个人微信昵称；现有值不会回显。</small>
        </label>
        <label>
          店长企业微信绑定手机号
          <input value={mobiles} onChange={(event) => setMobiles(event.target.value)} placeholder={config?.mobilesSet ? "已在服务端配置；留空表示不修改" : "多人用顿号分隔"} />
          <small className="fieldHelp">可替代用户ID，用于定向提醒店长；现有值不会回显。</small>
        </label>
        <div className="wechatConfigActions">
          <button onClick={() => onSave({ userIds, mobiles })} disabled={loading}><Icon name="save" />更新通知对象</button>
          <button className="primary" onClick={onTest} disabled={loading || !config?.configured}>发送测试通知</button>
        </div>
      </div>
      {!config?.configured && <small className="fieldHelp warningText">当前还缺：{config?.missing?.join("、") || "正在读取配置"}</small>}
    </section>
  );
}

function GenerationLayerEditor({ layer, onChange, managerWechatConfig, onSaveManagerWechat, onTestManagerWechat, loading }: {
  layer: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  managerWechatConfig: ManagerWechatConfigStatus | null;
  onSaveManagerWechat: (payload: Record<string, string | boolean>) => void;
  onTestManagerWechat: () => void;
  loading: boolean;
}) {
  const specs = layer.specs && typeof layer.specs === "object" ? layer.specs : {};
  const entries = Object.entries(specs);
  const customerLevelRules = layer.customerLevelRules || {};
  const levelRules = Array.isArray(customerLevelRules.levels) ? customerLevelRules.levels : [];
  const updateSpec = (key: string, patch: Record<string, any>) => onChange({ ...layer, specs: { ...specs, [key]: { ...(specs as any)[key], ...patch } } });
  const updateCustomerLevelRules = (patch: Record<string, any>) => onChange({ ...layer, customerLevelRules: { ...customerLevelRules, ...patch } });
  const updateLevelRule = (index: number, patch: Record<string, any>) => updateCustomerLevelRules({ levels: levelRules.map((item: any, itemIndex: number) => itemIndex === index ? { ...item, ...patch } : item) });
  return (
    <div className="configSection">
      <div className="buttonRow">
        <label className="check"><input type="checkbox" checked={Boolean(layer.allowLlmRewrite)} onChange={(event) => onChange({ ...layer, allowLlmRewrite: event.target.checked })} />允许大模型润色</label>
        <span className="hint">{layer.rewriteBoundary || "只允许润色表达，不允许重新判断事实、诊断或策略。"}</span>
      </div>
      <div className="customerLevelConfig">
        <div className="configToolbar"><strong>客户意向三级规则</strong><label className="check"><input type="checkbox" checked={customerLevelRules.enabled !== false} onChange={(event) => updateCustomerLevelRules({ enabled: event.target.checked })} />启用等级卡</label></div>
        <div className="logicNote"><strong>计算口径：</strong>{customerLevelRules.speakerRule || "仅统计客户原话"}；{customerLevelRules.countMode || "同一关键词每通会话仅计一次"}。累计分数达到某级阈值后输出该级，优先取最高等级。</div>
        <div className="levelRuleGrid">
          {levelRules.map((item: any, index: number) => <article key={`${item.level}-${index}`} className={`levelRuleCard levelRuleCard-${index + 1}`}>
            <div className="formGrid two">
              <label>等级<input value={item.level || ""} onChange={(event) => updateLevelRule(index, { level: event.target.value })} /></label>
              <label>等级名称<input value={item.name || ""} onChange={(event) => updateLevelRule(index, { name: event.target.value })} /></label>
              <label>每个关键词分值<input type="number" min="0" value={item.score || 0} onChange={(event) => updateLevelRule(index, { score: Number(event.target.value) })} /></label>
              <label>累计分数阈值<input type="number" min="0" value={item.threshold || 0} onChange={(event) => updateLevelRule(index, { threshold: Number(event.target.value) })} /></label>
            </div>
            <label>等级说明<input value={item.description || ""} onChange={(event) => updateLevelRule(index, { description: event.target.value })} /></label>
            <label className="textareaLabel">客户原话关键词<textarea rows={3} value={(item.keywords || []).join("、")} onChange={(event) => updateLevelRule(index, { keywords: splitText(event.target.value) })} /></label>
            <label className="textareaLabel">不计分表达<textarea rows={2} placeholder="例如：不置换、不订车" value={(item.excludedPhrases || []).join("、")} onChange={(event) => updateLevelRule(index, { excludedPhrases: splitText(event.target.value) })} /></label>
          </article>)}
        </div>
        <div className="formGrid three">
          <label className="check"><input type="checkbox" checked={customerLevelRules.managerAlert?.enabled !== false} onChange={(event) => updateCustomerLevelRules({ managerAlert: { ...(customerLevelRules.managerAlert || {}), enabled: event.target.checked } })} />启用店长介入预警</label>
          <label>预警触发等级<input value={customerLevelRules.managerAlert?.triggerLevel || "三级"} onChange={(event) => updateCustomerLevelRules({ managerAlert: { ...(customerLevelRules.managerAlert || {}), triggerLevel: event.target.value } })} /></label>
          <label>接收角色<input value={customerLevelRules.managerAlert?.recipientRole || "店长"} onChange={(event) => updateCustomerLevelRules({ managerAlert: { ...(customerLevelRules.managerAlert || {}), recipientRole: event.target.value } })} /></label>
          <label>推送渠道<input value={customerLevelRules.managerAlert?.channel || "店长企业微信群机器人"} onChange={(event) => updateCustomerLevelRules({ managerAlert: { ...(customerLevelRules.managerAlert || {}), channel: event.target.value } })} /></label>
        </div>
        <small className="fieldHelp">企业微信群机器人地址请在下方“店长企业微信通知配置”中填写。未配置时三级卡片会显示“待配置”，不会伪装成已经推送。</small>
      </div>
      <ManagerWechatConfigPanel config={managerWechatConfig} onSave={onSaveManagerWechat} onTest={onTestManagerWechat} loading={loading} />
      <div className="configToolbar">
        <strong>生成卡片规范</strong>
        <button onClick={() => onChange({ ...layer, specs: { [`card_custom_${entries.length + 1}`]: newGenerationSpec(entries.length), ...specs } })}>新增卡片</button>
      </div>
      <div className="configItemList">
        {entries.map(([key, item]: [string, any]) => (
          <article key={key} className="configItem">
            <div className="configItemHead">
              <strong>{item.type || "新生成卡片"}</strong>
              <button onClick={() => {
                const next = { ...specs };
                delete (next as any)[key];
                onChange({ ...layer, specs: next });
              }}>删除</button>
            </div>
            <div className="formGrid three">
              <label>卡片类型<input value={item.type || ""} onChange={(event) => updateSpec(key, { type: event.target.value })} /></label>
              <label>默认状态<input value={item.status || ""} onChange={(event) => updateSpec(key, { status: event.target.value })} /></label>
              <label>反馈动作<input value={(item.actions || []).join("、")} onChange={(event) => updateSpec(key, { actions: splitText(event.target.value) })} /></label>
            </div>
            <label className="textareaLabel">生成规范<textarea value={item.style || ""} onChange={(event) => updateSpec(key, { style: event.target.value })} rows={2} /></label>
            <label>必须包含<input value={(item.mustInclude || []).join("、")} onChange={(event) => updateSpec(key, { mustInclude: splitText(event.target.value) })} /></label>
            <label>禁用表述<input value={(item.forbidden || []).join("、")} onChange={(event) => updateSpec(key, { forbidden: splitText(event.target.value) })} /></label>
          </article>
        ))}
      </div>
    </div>
  );
}

function FeedbackLayerEditor({ layer, onChange }: { layer: Record<string, any>; onChange: (value: Record<string, any>) => void }) {
  const actionsByActor = layer.actionsByActor && typeof layer.actionsByActor === "object" ? layer.actionsByActor : {};
  const actors = Array.isArray(layer.actors) ? layer.actors : Object.keys(actionsByActor);
  const targetTypes = Array.isArray(layer.targetTypes) ? layer.targetTypes : [];
  const targetOptions = [
    ["fact_field", "事实字段"],
    ["diagnosis", "诊断问题"],
    ["strategy", "策略建议"],
    ["generated_card", "生成卡片"],
    ["transcript_correction", "转写人工修正"],
    ["business_outcome", "业务结果"]
  ];
  const toggleTarget = (key: string, checked: boolean) => onChange({
    ...layer,
    targetTypes: checked ? [...new Set([...targetTypes, key])] : targetTypes.filter((item: string) => item !== key)
  });
  return (
    <div className="configSection">
      <div className="configToolbar"><strong>可反馈内容</strong><span className="hint">选择销售、店长或运营可以对哪些结果进行反馈。</span></div>
      <div className="buttonRow feedbackTargetOptions">
        {targetOptions.map(([key, label]) => (
          <label className="check" key={key}><input type="checkbox" checked={targetTypes.includes(key)} onChange={(event) => toggleTarget(key, event.target.checked)} />{label}</label>
        ))}
      </div>
      <label className="textareaLabel">覆盖策略<textarea value={layer.overwritePolicy || ""} onChange={(event) => onChange({ ...layer, overwritePolicy: event.target.value })} rows={2} /></label>
      <div className="configItemList">
        {Object.entries(actionsByActor).map(([actor, actions]: [string, any]) => (
          <article key={actor} className="configItem">
            <div className="configItemHead">
              <strong>{formatConfigCodeLabel(actor)}</strong>
              <button onClick={() => {
                const next = { ...actionsByActor };
                delete (next as any)[actor];
                onChange({ ...layer, actionsByActor: next, actors: actors.filter((item: string) => item !== actor) });
              }}>删除角色</button>
            </div>
            <label>动作列表<input value={(actions || []).join("、")} onChange={(event) => onChange({ ...layer, actionsByActor: { ...actionsByActor, [actor]: splitText(event.target.value) } })} /></label>
          </article>
        ))}
      </div>
      <button onClick={() => {
        const roleName = `新增反馈角色${actors.length + 1}`;
        onChange({ ...layer, actionsByActor: { ...actionsByActor, [roleName]: ["采纳", "驳回"] }, actors: [...actors, roleName] });
      }}>新增反馈角色</button>
    </div>
  );
}

function ConditionTypeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const active = diagnosisConditionOptions.find((item) => item.value === value);
  return (
    <label>
      命中条件
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {diagnosisConditionOptions.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
      <small className="fieldHelp">{active?.help || "选择这条质检规则在什么情况下命中。"}</small>
    </label>
  );
}

function ConditionFieldSelect({
  value,
  onChange,
  checkObjects = [],
  sopItems = []
}: {
  value: string;
  onChange: (value: string) => void;
  checkObjects?: CheckObject[];
  sopItems?: Array<{ field: string; label: string }>;
}) {
  const objectOptions = checkObjects
    .filter((item) => item.enabled !== false && item.code)
    .map((item) => ({ value: item.code, label: `${formatConfigCodeLabel(item.name || item.code)}（${formatConfigCodeLabel(item.type || "检查对象")}）` }));
  const sopOptions = sopItems
    .filter((item) => item.field)
    .map((item) => ({ value: item.field, label: `${formatConfigCodeLabel(item.label || item.field)}（SOP动作）` }));
  const mergedOptions = mergeFieldOptions([...objectOptions, ...sopOptions, ...standardConditionFieldOptions]);
  const activeObject = checkObjects.find((item) => item.code === value);
  const hasLegacyValue = value && !mergedOptions.some((item) => item.value === value);
  return (
    <label>
      检查对象
      <select value={hasLegacyValue ? "__legacy__" : value} onChange={(event) => onChange(event.target.value === "__legacy__" ? value : event.target.value)}>
        <option value="">请选择检查对象</option>
        {hasLegacyValue && <option value="__legacy__">{formatConfigCodeLabel(value)}</option>}
        {mergedOptions.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
      <small className="fieldHelp">
        {activeObject?.llmMeaning || "选择规则要检查的事实层对象，例如“询问预算”“价格异议”。"}
      </small>
    </label>
  );
}

function EvidenceSelectorSelect({
  value,
  onChange,
  checkObjects = []
}: {
  value: string;
  onChange: (value: string) => void;
  checkObjects?: CheckObject[];
}) {
  const objectEvidenceOptions = checkObjects
    .filter((item) => item.enabled !== false && item.code)
    .map((item) => ({ value: item.code, label: `${formatConfigCodeLabel(item.name || item.code)}证据` }));
  const mergedOptions = mergeFieldOptions([...evidenceSelectorOptions, ...objectEvidenceOptions]);
  const hasLegacyValue = value && !mergedOptions.some((item) => item.value === value);
  return (
    <label>
      证据选择
      <select value={hasLegacyValue ? "__legacy__" : value} onChange={(event) => onChange(event.target.value === "__legacy__" ? value : event.target.value)}>
        {hasLegacyValue && <option value="__legacy__">{formatConfigCodeLabel(value)}</option>}
        {mergedOptions.map((item) => (
          <option key={item.value || "auto"} value={item.value}>{item.label}</option>
        ))}
      </select>
      <small className="fieldHelp">{hasLegacyValue ? "旧配置值已兼容保存；建议改选中文证据类型。" : "控制质检结果页优先展示哪类原文证据，默认可选自动匹配。"}</small>
    </label>
  );
}

function RuleFieldHelp({
  conditionType,
  conditionField,
  evidenceSelector,
  checkObjects = []
}: {
  conditionType: string;
  conditionField: string;
  evidenceSelector: string;
  checkObjects?: CheckObject[];
}) {
  const conditionLabel = labelForValue(diagnosisConditionOptions, conditionType) || "未选择";
  const checkObject = checkObjects.find((item) => item.code === conditionField);
  const fieldLabel = checkObject?.name || labelForValue(standardConditionFieldOptions, conditionField) || formatConfigCodeLabel(conditionField) || "未选择";
  const evidenceObject = checkObjects.find((item) => item.code === evidenceSelector);
  const evidenceLabel = evidenceObject?.name ? `${formatConfigCodeLabel(evidenceObject.name)}证据` : labelForValue(evidenceSelectorOptions, evidenceSelector) || formatConfigCodeLabel(evidenceSelector) || "自动匹配证据";
  return (
    <div className="ruleFieldHelp">
      <span><strong>命中条件</strong>：什么时候算销售出现问题，当前为“{conditionLabel}”。</span>
      <span><strong>检查对象</strong>：诊断层要读取事实层里的哪个对象，当前为“{fieldLabel}”。</span>
      {checkObject?.judgmentRule && <span><strong>判断口径</strong>：{checkObject.judgmentRule}</span>}
      {checkObject?.evidenceRequirement && <span><strong>证据要求</strong>：{checkObject.evidenceRequirement}</span>}
      <span><strong>证据选择</strong>：结果页展示哪类原文证据，当前为“{evidenceLabel}”。</span>
    </div>
  );
}

function ConfigRowActions({ onUp, onDown, onCopy, onDelete }: { onUp: () => void; onDown: () => void; onCopy: () => void; onDelete: () => void }) {
  return (
    <div className="buttonRow compactActions">
      <button onClick={onUp}>上移</button>
      <button onClick={onDown}>下移</button>
      <button onClick={onCopy}>复制</button>
      <button onClick={onDelete}>删除</button>
    </div>
  );
}

function moveItem<T>(items: T[], index: number, delta: number) {
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(nextIndex, 0, item);
  return next;
}

function duplicateItem<T extends Record<string, any>>(items: T[], index: number) {
  const copy = JSON.parse(JSON.stringify(items[index] || {}));
  if (copy.key) copy.key = `${copy.key}_copy`;
  if (copy.ruleId) copy.ruleId = `${copy.ruleId}_copy`;
  if (copy.strategyId) copy.strategyId = `${copy.strategyId}_copy`;
  if (copy.code) copy.code = `${copy.code}_copy`;
  if (!copy.key && !copy.ruleId && !copy.strategyId && copy.field) copy.field = `${copy.field}_copy`;
  if (!copy.key && !copy.ruleId && !copy.strategyId && copy.label) copy.label = `${copy.label}副本`;
  if (copy.name) copy.name = `${copy.name}副本`;
  return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
}

function getCheckObjects(layer: Record<string, any>, sopItems: Array<{ field: string; label: string; missingDiagnosis?: string }>): CheckObject[] {
  const existing = Array.isArray(layer.checkObjects) ? layer.checkObjects : [];
  const normalized = existing
    .filter((item: any) => item && (item.code || item.field || item.key))
    .map((item: any, index: number) => normalizeCheckObject(item, index));
  const byCode = new Map(normalized.map((item) => [item.code, item]));
  for (const sop of sopItems) {
    if (sop.field && !byCode.has(sop.field)) {
      byCode.set(sop.field, newCheckObjectFromSop(sop));
    }
  }
  return Array.from(byCode.values());
}

function normalizeCheckObject(item: any, index: number): CheckObject {
  const code = item.code || item.field || item.key || `check_object_${index + 1}`;
  const name = item.name || item.label || formatConfigCodeLabel(code);
  return {
    enabled: item.enabled !== false,
    code,
    name,
    type: item.type || "SOP动作",
    description: item.description || item.meaning || "",
    llmMeaning: item.llmMeaning || item.modelPrompt || item.description || "",
    judgmentRule: item.judgmentRule || item.positiveCriteria || "",
    evidenceRequirement: item.evidenceRequirement || "必须引用当前接待原文或时间戳证据；无法确认时输出未提及或未完成。"
  };
}

function mergeFieldOptions(options: Array<{ value: string; label: string }>) {
  const seen = new Set<string>();
  return options.filter((item) => {
    if (item.value == null || seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
}

function labelForValue(options: Array<{ value: string; label: string }>, value: string) {
  return options.find((item) => item.value === value)?.label;
}

function splitText(text: string) {
  return text.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function cloneConfig(config: AnalysisConfig) {
  return JSON.parse(JSON.stringify(config)) as AnalysisConfig;
}

function isCustomerInsightField(item: any) {
  const text = `${item.category || ""} ${item.field || ""} ${item.key || ""}`;
  if (/销售动作|销售能力|SOP动作完成情况|需求挖掘质量|产品讲解匹配度|异议处理情况|成交推进动作/.test(text)) return false;
  return /客户|画像|需求|异议|预算|周期|决策|竞品|意向|关注|场景|风险|证据|会话|购买|跟进/.test(text);
}

function newFactField(index: number) {
  return { key: `custom_fact_${index + 1}`, category: "自定义事实", field: "新事实字段", meaning: "", modelPrompt: "请基于原文提取该事实字段，无法确认时输出未提及。", outputRequirement: "抽取值、证据", allowedValues: "", enabled: true, requiresEvidence: true };
}

function newSopAction(index: number) {
  const number = index + 1;
  return {
    stage: "请填写接待阶段",
    field: `custom_sop_${number}`,
    label: `新SOP动作${number}`,
    missingDiagnosis: `未完成：新SOP动作${number}`
  };
}

function newCheckObject(index: number): CheckObject {
  const number = index + 1;
  return {
    enabled: true,
    code: `custom_check_object_${number}`,
    name: `新检查对象${number}`,
    type: "SOP动作",
    description: "请说明这个对象在业务质检中代表什么。",
    llmMeaning: "请告诉大模型如何从ASR对话中识别该对象，只能依据当前接待原文判断。",
    judgmentRule: "请填写完成/未完成/不适用的判断边界。",
    evidenceRequirement: "必须引用当前接待原文和时间戳；无明确证据时输出未提及或未完成。"
  };
}

function newCheckObjectFromSop(sop: { field: string; label: string; missingDiagnosis?: string }): CheckObject {
  const label = sop.label || sop.field || "新SOP动作";
  return {
    enabled: true,
    code: sop.field,
    name: label,
    type: "SOP动作",
    description: `检查销售是否完成“${label}”这个SOP动作。`,
    llmMeaning: `识别销售在当前接待中是否完成“${label}”。只能基于销售和客户原文判断，不要根据行业常识补全。`,
    judgmentRule: `销售明确完成“${label}”相关问询、讲解或推进动作时视为完成；没有原文证据时视为未完成。`,
    evidenceRequirement: "引用销售完成该动作的原文；若未完成，可引用客户相关表达或输出无明确完成证据。"
  };
}

function newDiagnosisRule(index: number) {
  return { enabled: true, ruleId: `custom-rule-${index + 1}`, issue: "新诊断问题", category: "自定义问题", riskLevel: "中", conditionType: "missing_sop", conditionField: "", reason: "命中配置规则", recoverable: true, manualReviewRequired: false, evidenceSelector: "" };
}

function newStrategy(index: number) {
  return { enabled: true, strategyId: `custom-strategy-${index + 1}`, category: "自定义策略", triggerIssues: ["新诊断问题"], priority: 50, action: "补充针对性跟进动作", timing: "24小时内", channel: "微信或电话", materials: [], managerIntervention: false };
}

function newGenerationSpec(index: number) {
  return { type: `自定义卡片${index + 1}`, status: "待确认", style: "短句、可执行、必须带证据提醒", mustInclude: ["动作", "证据"], forbidden: ["不得编造事实"], actions: ["采纳", "不适用"] };
}

function Metric({ label, value, help }: { label: string; value: string | number; help?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {help && <small>{help}</small>}
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="keyValue">
      <span>{label}</span>
      <strong>{value || "未提及"}</strong>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "blue" | "teal" | "amber" | "gray" }) {
  return <span className={`chip ${tone}`}>{label}</span>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Icon name="empty" />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function Icon({ name }: { name: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  const paths: Record<string, React.ReactNode> = {
    list: <><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></>,
    wave: <><path d="M3 12h2l2-7 4 14 3-9 2 5h5" /></>,
    target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M22 12h-3" /><path d="M12 22v-3" /><path d="M2 12h3" /></>,
    chain: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    graph: <><circle cx="5" cy="6" r="2" /><circle cx="19" cy="6" r="2" /><circle cx="12" cy="18" r="2" /><path d="M7 6h10" /><path d="M6.5 7.5l4.3 8.8" /><path d="M17.5 7.5l-4.3 8.8" /></>,
    model: <><path d="M12 2l8 4-8 4-8-4z" /><path d="M4 10l8 4 8-4" /><path d="M4 14l8 4 8-4" /><path d="M4 18l8 4 8-4" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    loop: <><path d="M17 2l4 4-4 4" /><path d="M3 11V9a3 3 0 0 1 3-3h15" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v2a3 3 0 0 1-3 3H3" /></>,
    spark: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8z" /></>,
    tag: <><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><path d="M7.5 7.5h.01" /></>,
    upload: <><path d="M12 16V4" /><path d="M7 9l5-5 5 5" /><path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" /></>,
    audio: <><path d="M12 3v18" /><path d="M8 8v8" /><path d="M4 11v2" /><path d="M16 6v12" /><path d="M20 10v4" /></>,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><path d="M17 21v-8H7v8" /><path d="M7 3v5h8" /></>,
    play: <path d="M8 5v14l11-7z" />,
    pause: <><path d="M8 5v14" /><path d="M16 5v14" /></>,
    skip: <><path d="M5 5v14l8-7z" /><path d="M19 5v14" /></>,
    repeat: <><path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></>,
    settings: <><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z" /><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.08 1.65V21.4a2.1 2.1 0 1 1-4.2 0v-.16a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.98.36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05A1.8 1.8 0 0 0 3.86 15a1.8 1.8 0 0 0-1.65-1.08H2.05a2.1 2.1 0 1 1 0-4.2h.16a1.8 1.8 0 0 0 1.65-1.08 1.8 1.8 0 0 0-.36-1.98l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05a1.8 1.8 0 0 0 1.98.36 1.8 1.8 0 0 0 1.08-1.65V2.24a2.1 2.1 0 1 1 4.2 0v.16a1.8 1.8 0 0 0 1.08 1.65 1.8 1.8 0 0 0 1.98-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.08h.16a2.1 2.1 0 1 1 0 4.2h-.16A1.8 1.8 0 0 0 19.4 15z" /></>,
    check: <path d="M20 6L9 17l-5-5" />,
    alert: <><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
    empty: <><path d="M4 7h16" /><path d="M4 7l2 13h12l2-13" /><path d="M9 11h6" /></>
  };
  return <svg {...common}>{paths[name] || paths.list}</svg>;
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(data.message || data.error || `请求失败：${response.status}`);
  }
  return data;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function findSplitPoint(text: string) {
  const marks = ["？", "?", "。", "，", ","];
  const candidates = marks.map((mark) => text.indexOf(mark)).filter((index) => index > 0 && index < text.length - 1);
  return candidates.length ? Math.min(...candidates) + 1 : Math.floor(text.length / 2);
}

function sopLabel(key: string) {
  const map: Record<string, string> = {
    greeted_customer: "问候客户",
    asked_use_case: "询问用途",
    asked_budget: "询问预算",
    asked_purchase_timeline: "询问购车周期",
    asked_decision_maker: "询问决策人",
    introduced_product_by_need: "结合需求讲解",
    invited_test_drive: "邀约试驾",
    quoted_price: "报价",
    handled_objection: "处理异议",
    confirmed_next_followup: "确认下次跟进"
  };
  return map[key] || factKeyLabels[key] || humanizeFactKey(key);
}

type RootElement = HTMLElement & { reactRoot?: ReturnType<typeof createRoot> };

const rootElement = document.getElementById("root") as RootElement;
rootElement.reactRoot = rootElement.reactRoot || createRoot(rootElement);
rootElement.reactRoot.render(<App />);
