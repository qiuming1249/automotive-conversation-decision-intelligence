const contradictionPairs = [
  ["是", "否"],
  ["已完成", "未完成"],
  ["已确认", "未确认"],
  ["有", "无"],
  ["接受", "拒绝"]
];

export function buildSemanticRuntime({ session, utterances, result, feedback = [], semanticModel = {} }) {
  const factPackage = result?.factPackage || {};
  const extractedFacts = Array.isArray(factPackage.extractedFacts) ? factPackage.extractedFacts : [];
  const segments = buildSegments(session, utterances);
  const evidence = buildEvidence(session, extractedFacts, factPackage, segments);
  const facts = extractedFacts.map((item, index) => ({
    id: `fact:${session.id}:${item.key || index}`,
    sessionId: session.id,
    factKey: item.key || `事实${index + 1}`,
    factType: item.category || "洞察事实",
    name: item.field || item.key || `事实${index + 1}`,
    value: item.value ?? "未提及",
    status: evidence.some((row) => row.factKey === item.key) ? "有证据" : "未提及",
    sourceRole: inferFactSourceRole(item),
    effectiveAt: earliestEvidenceTime(item.evidence),
    supersedesFactId: null
  }));
  const provenance = evidence.map((item) => ({
    id: `trace:${item.id}`,
    sourceId: item.id,
    sourceType: "原文证据",
    relation: "支持",
    targetId: `fact:${session.id}:${item.factKey}`,
    targetType: "洞察事实",
    rule: "证据必须来自当前会话、保留说话人和时间戳"
  }));
  const conflicts = detectConflicts(facts, evidence);
  const decisionRuns = buildDecisionRuns(session, result, facts, evidence);
  const attribution = buildAttribution(session, result, feedback);
  const capabilityCycle = buildCapabilityCycle(session, result, feedback);
  const timeline = buildTimeline(session, segments, facts, result, feedback);
  const graph = buildInstanceGraph(session, segments, facts, evidence, result, provenance, conflicts);

  return {
    framework: {
      ontologyMethod: "本体提示词映射",
      instanceGraphMethod: "Semantica式实例图谱",
      extractionPolicy: "完整对话只调用一次大模型生成事实包；诊断、策略、生成和反馈均由配置与规则驱动",
      conflictPolicy: "客户明确原话优先于销售转述；后发生的明确表达可覆盖旧事实；无法裁决时并存并进入人工复核",
      modelSnapshot: {
        entities: Array.isArray(semanticModel.entities) ? semanticModel.entities.length : 0,
        attributes: Array.isArray(semanticModel.attributes) ? semanticModel.attributes.length : 0,
        relationships: Array.isArray(semanticModel.relationships) ? semanticModel.relationships.length : 0,
        synonyms: Array.isArray(semanticModel.synonyms) ? semanticModel.synonyms.length : 0
      }
    },
    conversation: {
      id: `conversation:${session.id}`,
      sessionId: session.id,
      receptionNo: session.reception_no,
      store: session.store,
      salesperson: session.salesperson,
      customerName: session.customer_name,
      startedAt: session.start_at,
      endedAt: session.end_at,
      sourceVersion: session.active_version,
      status: session.analysis_status
    },
    segments,
    facts,
    evidence,
    provenance,
    conflicts,
    timeline,
    decisionRuns,
    attribution,
    capabilityCycle,
    graph,
    generatedAt: new Date().toISOString()
  };
}

function buildSegments(session, utterances) {
  const included = (utterances || []).filter((item) => item.included !== false && String(item.text || "").trim());
  const groups = [];
  let current = [];
  for (const item of included) {
    const previous = current[current.length - 1];
    const gap = previous ? Number(item.startSec || 0) - Number(previous.endSec || previous.startSec || 0) : 0;
    if (current.length >= 12 || gap > 90) {
      groups.push(current);
      current = [];
    }
    current.push(item);
  }
  if (current.length) groups.push(current);
  return groups.map((items, index) => ({
    id: `segment:${session.id}:${index + 1}`,
    sessionId: session.id,
    sequence: index + 1,
    startSec: Number(items[0]?.startSec || 0),
    endSec: Number(items[items.length - 1]?.endSec || items[items.length - 1]?.startSec || 0),
    roles: [...new Set(items.map((item) => item.role))],
    utteranceIds: items.map((item) => item.id),
    segmentType: inferSegmentType(items.map((item) => item.text).join(" ")),
    summary: items.slice(0, 2).map((item) => `${item.role}：${item.text}`).join("；")
  }));
}

function inferSegmentType(text) {
  if (/你好|您好|欢迎|请问/.test(text)) return "接待开场";
  if (/用途|预算|谁开|什么时候|家用|通勤/.test(text)) return "需求挖掘";
  if (/试驾|体验|开一下/.test(text)) return "体验推进";
  if (/报价|优惠|落地|首付|月供|金融/.test(text)) return "报价议价";
  if (/贵|竞品|但是|顾虑|担心|不考虑/.test(text)) return "异议处理";
  if (/微信|电话|联系|下次|明天|复店/.test(text)) return "跟进闭环";
  return "产品沟通";
}

function buildEvidence(session, extractedFacts, factPackage, segments) {
  const rows = [];
  for (const [factIndex, fact] of extractedFacts.entries()) {
    for (const [index, item] of normalizeEvidence(fact.evidence).entries()) {
      const startSec = parseTimestamp(item.timestamp);
      rows.push({
        id: `evidence:${session.id}:${fact.key || factIndex}:${index + 1}`,
        sessionId: session.id,
        factKey: fact.key || `事实${factIndex + 1}`,
        timestamp: item.timestamp || formatTime(startSec),
        startSec,
        speaker: item.speaker || "未知角色",
        quote: item.quote,
        evidenceType: item.type || fact.category || "事实证据",
        segmentId: findSegmentId(segments, startSec),
        sourceVersion: session.active_version,
        provenanceStatus: "可回溯"
      });
    }
  }
  if (!rows.length) {
    for (const [index, item] of normalizeEvidence(factPackage.evidence).entries()) {
      const startSec = parseTimestamp(item.timestamp);
      rows.push({
        id: `evidence:${session.id}:base:${index + 1}`,
        sessionId: session.id,
        factKey: "基础证据",
        timestamp: item.timestamp || formatTime(startSec),
        startSec,
        speaker: item.speaker || "未知角色",
        quote: item.quote,
        evidenceType: item.type || "基础证据",
        segmentId: findSegmentId(segments, startSec),
        sourceVersion: session.active_version,
        provenanceStatus: "可回溯"
      });
    }
  }
  return rows;
}

function detectConflicts(facts, evidence) {
  const conflicts = [];
  for (const fact of facts) {
    const text = flattenValue(fact.value);
    const pair = contradictionPairs.find(([a, b]) => text.includes(a) && text.includes(b));
    const relatedEvidence = evidence.filter((item) => item.factKey === fact.factKey);
    const roleConflict = relatedEvidence.some((a, index) => relatedEvidence.slice(index + 1).some((b) => a.speaker !== b.speaker && isOpposingText(a.quote, b.quote)));
    if (!pair && !roleConflict) continue;
    conflicts.push({
      id: `conflict:${fact.id}`,
      factId: fact.id,
      factName: fact.name,
      status: "待人工复核",
      conflictType: roleConflict ? "跨角色表达冲突" : "同一事实值互斥",
      candidates: relatedEvidence.map((item) => ({ speaker: item.speaker, timestamp: item.timestamp, quote: item.quote })),
      resolutionRule: "优先采用客户明确且更晚发生的原话；无法判定时保留冲突，不自动覆盖。"
    });
  }
  return conflicts;
}

function buildDecisionRuns(session, result, facts, evidence) {
  return (result?.diagnoses || []).map((item, index) => ({
    id: `decision:${session.id}:${item.ruleId || index}`,
    ruleId: item.ruleId || `规则${index + 1}`,
    ruleName: item.issue,
    result: "命中",
    riskLevel: item.riskLevel,
    inputFactIds: facts.filter((fact) => evidenceForDiagnosis(item, evidence).some((ev) => ev.factKey === fact.factKey)).map((fact) => fact.id),
    evidenceIds: evidenceForDiagnosis(item, evidence).map((row) => row.id),
    explanation: item.reason || "由配置规则命中",
    manualReviewRequired: Boolean(item.manualReviewRequired)
  }));
}

function buildAttribution(session, result, feedback) {
  const outcomes = feedback.filter((item) => /成交|败单|复店|已跟进|有效/.test(`${item.action} ${item.details}`));
  const adoptions = feedback.filter((item) => /采纳|修改后使用|已跟进/.test(item.action));
  return {
    sessionId: session.id,
    status: outcomes.length ? "已有结果反馈/待归因复核" : "待业务结果",
    observedOutcomes: outcomes.map((item) => ({ action: item.action, details: item.details, occurredAt: item.createdAt || item.created_at })),
    adoptedInterventions: adoptions.map((item) => ({ action: item.action, target: item.target, occurredAt: item.createdAt || item.created_at })),
    candidateLinks: (result?.strategies || []).slice(0, 5).map((item) => ({
      strategyId: item.strategyId,
      action: item.nextBestAction,
      outcome: outcomes[0]?.action || "待观察",
      attributionLevel: outcomes.length && adoptions.length ? "候选关联" : "证据不足",
      note: "只有策略被采纳并执行、且后续业务结果有回流时，才进入归因分析；当前不输出确定因果。"
    }))
  };
}

function buildCapabilityCycle(session, result, feedback) {
  const dimensions = new Map();
  for (const diagnosis of result?.diagnoses || []) {
    const key = diagnosis.category || "销售执行";
    if (!dimensions.has(key)) dimensions.set(key, []);
    dimensions.get(key).push(diagnosis.issue);
  }
  const hasIntervention = feedback.some((item) => /采纳|加入陪练|已跟进|修改后使用/.test(item.action));
  const hasReview = feedback.some((item) => /复检|审核通过|成交|复店/.test(`${item.action} ${item.details}`));
  return {
    salesperson: session.salesperson,
    sessionId: session.id,
    stage: hasReview ? "已复检" : hasIntervention ? "已干预/待复检" : "已分析/待干预",
    dimensions: [...dimensions.entries()].map(([name, issues]) => ({ name, issues, sampleCount: 1 })),
    intervention: hasIntervention ? "已记录销售采纳或训练动作" : "待从策略卡采纳、店长辅导或AI陪练创建干预",
    review: hasReview ? "已有复检或业务结果反馈" : "待下一通同类场景复检",
    nextMeasurement: "比较同一销售在同类诊断问题上的再次命中率、SOP完成率和策略执行结果"
  };
}

function buildTimeline(session, segments, facts, result, feedback) {
  const events = segments.map((item) => ({ id: `time:${item.id}`, order: item.sequence, atSec: item.startSec, type: "会话片段", title: item.segmentType, refId: item.id }));
  facts.filter((item) => item.effectiveAt != null).forEach((item, index) => events.push({ id: `time:${item.id}`, order: 1000 + index, atSec: item.effectiveAt, type: "事实形成", title: item.name, refId: item.id }));
  (result?.diagnoses || []).forEach((item, index) => events.push({ id: `time:diagnosis:${index}`, order: 2000 + index, atSec: null, type: "规则诊断", title: item.issue, refId: item.id }));
  (result?.strategies || []).forEach((item, index) => events.push({ id: `time:strategy:${index}`, order: 3000 + index, atSec: null, type: "策略匹配", title: item.nextBestAction, refId: item.id }));
  feedback.forEach((item, index) => events.push({ id: `time:feedback:${index}`, order: 4000 + index, atSec: null, type: "反馈结果", title: item.action, refId: item.id, occurredAt: item.createdAt || item.created_at }));
  return events.sort((a, b) => (a.atSec ?? a.order) - (b.atSec ?? b.order));
}

function buildInstanceGraph(session, segments, facts, evidence, result, provenance, conflicts) {
  const nodes = [
    { id: `conversation:${session.id}`, type: "接待会话", label: session.reception_no, status: "已分析" },
    { id: `customer:${session.id}`, type: "客户", label: session.customer_name || "临时客户", status: "本次会话主体" },
    { id: `sales:${session.id}`, type: "销售", label: session.salesperson, status: "录音工牌绑定" },
    ...segments.map((item) => ({ id: item.id, type: "会话片段", label: `${item.sequence}. ${item.segmentType}`, status: "已切分" })),
    ...facts.map((item) => ({ id: item.id, type: item.factType || "洞察事实", label: item.name, status: conflicts.some((row) => row.factId === item.id) ? "冲突待复核" : item.status })),
    ...evidence.map((item) => ({ id: item.id, type: "原文证据", label: `${item.timestamp} ${item.speaker}`, status: item.provenanceStatus })),
    ...conflicts.map((item) => ({ id: item.id, type: "事实冲突", label: item.factName, status: item.status })),
    ...(result?.diagnoses || []).map((item) => ({ id: `diagnosis:${item.id}`, type: "诊断问题", label: item.issue, status: item.manualReviewRequired ? "需复核" : "规则命中" })),
    ...(result?.strategies || []).map((item) => ({ id: `strategy:${item.id}`, type: "决策策略", label: item.nextBestAction, status: "已匹配" }))
  ];
  const edges = [
    { source: `conversation:${session.id}`, relation: "包含", target: `customer:${session.id}` },
    { source: `conversation:${session.id}`, relation: "包含", target: `sales:${session.id}` },
    ...segments.map((item) => ({ source: `conversation:${session.id}`, relation: "包含", target: item.id, temporalOrder: item.sequence })),
    ...evidence.map((item) => ({ source: item.segmentId || `conversation:${session.id}`, relation: "产生", target: item.id })),
    ...provenance.map((item) => ({ source: item.sourceId, relation: item.relation, target: item.targetId })),
    ...facts.map((item) => ({ source: item.sourceRole === "客户" ? `customer:${session.id}` : item.sourceRole === "销售" ? `sales:${session.id}` : `conversation:${session.id}`, relation: item.sourceRole === "销售" ? "执行" : "表达", target: item.id })),
    ...conflicts.map((item) => ({ source: item.factId, relation: "存在冲突", target: item.id })),
    ...(result?.diagnoses || []).map((item) => ({ source: `conversation:${session.id}`, relation: "规则诊断", target: `diagnosis:${item.id}` })),
    ...(result?.strategies || []).map((item) => ({ source: `diagnosis:${item.diagnosisId}`, relation: "匹配", target: `strategy:${item.id}` }))
  ];
  return { nodes, edges };
}

function normalizeEvidence(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.map((item) => typeof item === "string" ? evidenceFromText(item) : item).filter((item) => String(item?.quote || "").trim());
}

function evidenceFromText(text) {
  const match = String(text).match(/^\[?([0-9]{1,2}:[0-9]{2})\]?\s*([^：:]+)?[：:]?\s*(.*)$/);
  return { timestamp: match?.[1] || "", speaker: match?.[2]?.trim() || "未知角色", quote: match?.[3]?.trim() || String(text), type: "原文证据" };
}

function parseTimestamp(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds || 0)));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function findSegmentId(segments, second) {
  return segments.find((item) => second >= item.startSec && second <= item.endSec)?.id || segments[0]?.id || null;
}

function inferFactSourceRole(item) {
  const speakers = normalizeEvidence(item.evidence).map((row) => row.speaker);
  if (speakers.some((value) => /客户|陪同/.test(value)) && speakers.some((value) => /销售|店长/.test(value))) return "客户与销售";
  if (speakers.some((value) => /客户|陪同/.test(value))) return "客户";
  if (speakers.some((value) => /销售|店长/.test(value))) return "销售";
  return "未明确";
}

function earliestEvidenceTime(value) {
  const times = normalizeEvidence(value).map((item) => parseTimestamp(item.timestamp)).filter((item) => Number.isFinite(item));
  return times.length ? Math.min(...times) : null;
}

function flattenValue(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function isOpposingText(a, b) {
  return contradictionPairs.some(([left, right]) => (a.includes(left) && b.includes(right)) || (a.includes(right) && b.includes(left)));
}

function evidenceForDiagnosis(item, evidence) {
  const direct = normalizeEvidence(item.evidence);
  if (!direct.length) return [];
  return evidence.filter((row) => direct.some((candidate) => candidate.quote === row.quote || (candidate.timestamp && candidate.timestamp === row.timestamp)));
}
