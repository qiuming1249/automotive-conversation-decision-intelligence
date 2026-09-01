import { loadAnalysisConfig } from "./analysisConfig.js";
import { env } from "./env.js";

const keywords = {
  price: /贵|价格|优惠|预算|落地|月供|首付|便宜|多少钱|金融/,
  competitor: /比亚迪|特斯拉|理想|问界|蔚来|小鹏|其他店|别家|竞品|A品牌|对比/,
  decision: /老婆|老公|家人|父母|领导|老板|商量|回去问/,
  afterSales: /售后|质保|维修|保养|退换|质量/,
  delivery: /现车|颜色|库存|交付|等车|配置/,
  testDrive: /试驾|体验|试乘|开一下|坐一下/,
  quote: /报价|落地|优惠|万|月供|首付|保险/,
  follow: /微信|电话|明天|晚上|上午|联系|发你|再约|下次|复店/,
  needs: /家用|通勤|商务|接送|老人|孩子|空间|安全|动力|智能|续航|外观|保值/,
  purchaseTime: /今天|本周|周末|月底|近期|一个月|三个月|不急|什么时候买|多久买/
};

export async function runAnalysis(session, utterances) {
  const rules = loadAnalysisConfig();
  assertFactLayerReady(rules.factLayer);
  const included = utterances.filter((item) => item.included && item.text.trim());
  const customer = included.filter((item) => ["主客户", "陪同人", "电话对方"].includes(item.role));
  const sales = included.filter((item) => ["销售", "店长"].includes(item.role));
  const allText = included.map((item) => item.text).join(" ");
  const customerText = customer.map((item) => item.text).join(" ");
  const salesText = sales.map((item) => item.text).join(" ");

  const evidence = collectEvidence(included);
  const objections = collectObjections(customer, sales);
  const concerns = collectConcerns(customerText);
  const competitors = collectCompetitors(customerText);
  const sopActions = collectSopActions(salesText, customerText, objections);
  const intentLevel = inferIntent(customerText, salesText, sopActions, objections);
  const followUpValue = inferFollowUpValue(intentLevel, objections, sopActions);
  const salesTags = inferSalesTags(sopActions, objections);
  const riskSegments = collectRiskSegments(included);
  const candidateScripts = collectCandidateScripts(sales, customer);
  const factExtractionFields = Array.isArray(rules.factLayer?.fields) ? rules.factLayer.fields.filter((item) => item.enabled !== false) : [];

  const factPackage = {
    layer: "对话事实层",
    generatedBy: rules.factLayer?.model?.displayName || "配置化事实层抽取",
    factExtractionMeta: {
      schemaSource: rules.factLayer?.schemaSource || "事实层提取数据说明.xlsx",
      extractionMode: rules.factLayer?.model?.provider === "poc-local" ? "POC本地事实抽取器" : "大模型事实层抽取",
      fieldCount: factExtractionFields.length,
      promptSnapshot: buildFactPromptSnapshot(rules.factLayer, factExtractionFields)
    },
    session: {
      id: session.id,
      receptionNo: session.reception_no,
      store: session.store,
      salesperson: session.salesperson,
      sourceVersion: session.active_version
    },
    conversation: {
      mainScene: inferScene(allText),
      salesStage: inferSalesStage(allText, sopActions, objections),
      conclusion: inferConversationConclusion(customerText, salesText),
      evidenceCount: evidence.length
    },
    customerProfile: {
      useCase: extractUseCase(customerText),
      budgetValue: extractBudget(customerText),
      purchaseTimeline: extractTimeline(customerText),
      decisionMakers: extractDecisionMakers(customerText),
      decisionChainStatus: keywords.decision.test(customerText) ? "决策链未闭合" : "未明确",
      competitors,
      comparisonDimension: competitors.length ? extractComparisonDimension(customerText) : "未提及"
    },
    customerTags: {
      intentLevel,
      purchaseStage: inferPurchaseStage(allText, objections),
      objections: objections.map((item) => item.type),
      concerns,
      followUpValue,
      priceSensitivity: keywords.price.test(customerText) ? "明显" : "未明确",
      urgencyLevel: extractTimeline(customerText) === "未提及" ? "未知" : "已表达"
    },
    salesTags,
    sopActions,
    customerObjections: objections,
    evidence,
    candidateScripts,
    riskSegments,
    extractedFacts: []
  };

  factPackage.extractedFacts = await extractFactsWithConfiguredModel(factExtractionFields, factPackage, included, rules.factLayer);
  applyExtractedFactsToFactPackage(factPackage, rules);

  const diagnoses = runDiagnosisRules(factPackage, rules.diagnosisLayer);
  const strategies = matchStrategies(factPackage, diagnoses, rules.strategyLayer);
  factPackage.advancedAnalysis = buildAdvancedAnalysis(factPackage, diagnoses, strategies, rules.advancedCapabilities);
  const generatedCards = renderGeneratedCards(factPackage, diagnoses, strategies, rules.generationLayer, rules.advancedCapabilities);
  const score = calculateScore(factPackage.sopActions, diagnoses, rules.diagnosisLayer?.scoring);

  return { factPackage, diagnoses, strategies, generatedCards, score };
}

export function rebuildAnalysisFromFactPackage(factPackage, rules = loadAnalysisConfig()) {
  const nextFactPackage = JSON.parse(JSON.stringify(factPackage || {}));
  applyExtractedFactsToFactPackage(nextFactPackage, rules);
  applyFactCorrections(nextFactPackage, nextFactPackage.factCorrections || [], rules);
  const diagnoses = runDiagnosisRules(nextFactPackage, rules.diagnosisLayer);
  const strategies = matchStrategies(nextFactPackage, diagnoses, rules.strategyLayer);
  nextFactPackage.advancedAnalysis = buildAdvancedAnalysis(nextFactPackage, diagnoses, strategies, rules.advancedCapabilities);
  const generatedCards = renderGeneratedCards(nextFactPackage, diagnoses, strategies, rules.generationLayer, rules.advancedCapabilities);
  const score = calculateScore(nextFactPackage.sopActions || {}, diagnoses, rules.diagnosisLayer?.scoring);
  return { factPackage: nextFactPackage, diagnoses, strategies, generatedCards, score };
}

export function rebuildAnalysisFromFactEdits(factPackage, edits = [], rules = loadAnalysisConfig()) {
  const nextFactPackage = JSON.parse(JSON.stringify(factPackage || {}));
  const previous = Array.isArray(nextFactPackage.factCorrections) ? nextFactPackage.factCorrections : [];
  const byCode = new Map(previous.map((item) => [item.factCode, item]));
  for (const edit of edits) {
    if (!FACT_CORRECTION_BINDINGS[edit?.factCode]) continue;
    byCode.set(edit.factCode, {
      factCode: edit.factCode,
      value: String(edit.value ?? "").trim(),
      status: String(edit.status || "").trim(),
      source: "人工修正",
      updatedAt: new Date().toISOString()
    });
  }
  nextFactPackage.factCorrections = [...byCode.values()];
  applyExtractedFactsToFactPackage(nextFactPackage, rules);
  applyFactCorrections(nextFactPackage, nextFactPackage.factCorrections, rules);
  const diagnoses = runDiagnosisRules(nextFactPackage, rules.diagnosisLayer);
  const strategies = matchStrategies(nextFactPackage, diagnoses, rules.strategyLayer);
  nextFactPackage.advancedAnalysis = buildAdvancedAnalysis(nextFactPackage, diagnoses, strategies, rules.advancedCapabilities);
  const generatedCards = renderGeneratedCards(nextFactPackage, diagnoses, strategies, rules.generationLayer, rules.advancedCapabilities);
  const score = calculateScore(nextFactPackage.sopActions || {}, diagnoses, rules.diagnosisLayer?.scoring);
  return { factPackage: nextFactPackage, diagnoses, strategies, generatedCards, score };
}

export function getLayerRuleManifest(rules = loadAnalysisConfig()) {
  return [
    { layer: "事实层", functionName: "事实字段标准化", input: "一次大模型抽取结果 + 人工修正", ruleSource: "事实层字段、提示词、本体映射", output: "标准事实数据表", trigger: "完整分析或事实修正" },
    { layer: "客户洞察与SOP", functionName: "事实映射与标签计算", input: "客户事实、销售行为事实", ruleSource: "客户标签树、SOP动作库、质量阈值", output: "客户标签、SOP完成状态", trigger: "事实表变化后自动执行" },
    { layer: "诊断层", functionName: "诊断规则命中", input: "标准事实表、客户标签、SOP状态", ruleSource: `${(rules.diagnosisLayer?.rules || []).filter((item) => item.enabled !== false).length} 条启用诊断规则`, output: "问题、风险、扣分、证据", trigger: "洞察与SOP计算完成后" },
    { layer: "策略层", functionName: "按问题匹配策略", input: "诊断问题、客户事实、风险等级", ruleSource: `${(rules.strategyLayer?.strategies || []).filter((item) => item.enabled !== false).length} 条启用策略`, output: "动作、时机、渠道、材料", trigger: "诊断结果变化后" },
    { layer: "生成层", functionName: "业务卡片渲染", input: "事实 + 诊断 + 策略", ruleSource: "生成卡片规范与高级能力配置", output: "跟进、败单候选、话术、能力卡片", trigger: "策略结果变化后" },
    { layer: "反馈层", functionName: "反馈事件记录", input: "诊断、策略、生成卡片", ruleSource: "反馈角色、动作、作用对象", output: "采纳、驳回、复核、业务结果事件", trigger: "人工操作后记录，不反向篡改事实" }
  ];
}

function buildFactPromptSnapshot(factLayer, fields) {
  const model = factLayer?.model || {};
  return {
    provider: model.provider || "",
    displayName: model.displayName || "",
    modelEnv: model.modelEnv || "LLM_MODEL",
    systemPrompt: factLayer?.systemPrompt || "",
    userPromptTemplate: factLayer?.userPromptTemplate || "",
    fields: fields.map((field) => ({
      key: field.key,
      category: field.category,
      field: field.field,
      meaning: field.meaning,
      modelPrompt: field.modelPrompt,
      outputRequirement: field.outputRequirement,
      allowedValues: field.allowedValues || "",
      requiresEvidence: field.requiresEvidence !== false
    }))
  };
}

function assertFactLayerReady(factLayer) {
  if (!factLayer?.enabled || !factLayer.model?.enabled) {
    throw new Error("FACT_MODEL_NOT_CONFIGURED: 事实层模型未启用，不能继续生成诊断、策略和卡片。");
  }
  const model = factLayer.model || {};
  if (model.provider === "poc-local" && model.allowLocalExtractor !== false) return;
  const apiKey = env(model.apiKeyEnv || "LLM_API_KEY");
  const modelName = env(model.modelEnv || "LLM_MODEL");
  if (!apiKey || !modelName) {
    throw new Error(`FACT_MODEL_NOT_CONFIGURED: 事实层大模型未配置，请补齐 ${model.apiKeyEnv || "LLM_API_KEY"} 和 ${model.modelEnv || "LLM_MODEL"}。`);
  }
}

async function extractFactsWithConfiguredModel(fields, localFact, utterances, factLayer) {
  const model = factLayer?.model || {};
  if (model.provider === "poc-local" && model.allowLocalExtractor !== false) {
    return buildExtractedFacts(fields, localFact);
  }
  const result = await callOpenAiCompatibleFactModel(fields, utterances, factLayer);
  if (!Array.isArray(result?.extractedFacts)) {
    throw new Error("事实层大模型未返回 extractedFacts 数组。");
  }
  return sanitizeExtractedFacts(result.extractedFacts, fields);
}

async function callOpenAiCompatibleFactModel(fields, utterances, factLayer) {
  const model = factLayer?.model || {};
  const baseUrl = env(model.baseUrlEnv || "LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, "");
  const apiKey = env(model.apiKeyEnv || "LLM_API_KEY");
  const modelName = env(model.modelEnv || "LLM_MODEL");
  const transcript = utterances.map((item) => `[${formatTime(item.startSec)}] ${item.role}：${item.text}`).join("\n");
  const fieldBrief = fields.map((field) => ({
    key: field.key,
    category: field.category,
    field: field.field,
    meaning: field.meaning,
    outputRequirement: field.outputRequirement,
    modelPrompt: field.modelPrompt,
    allowedValues: field.allowedValues || "",
    requiresEvidence: field.requiresEvidence !== false
  }));
  const configuredUserPrompt = String(factLayer.userPromptTemplate || "{{转写文本}}");
  const hasTranscriptPlaceholder = /\{\{\s*(?:转写文本|transcript)\s*\}\}/i.test(configuredUserPrompt);
  const userPrompt = hasTranscriptPlaceholder
    ? configuredUserPrompt
      .replace(/\{\{\s*转写文本\s*\}\}/g, transcript)
      .replace(/\{\{\s*transcript\s*\}\}/gi, transcript)
    : `${configuredUserPrompt}\n\n以下为本次接待的完整转写文本：\n${transcript}`;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      response_format: { type: "json_object" },
      temperature: Number(model.temperature ?? 0),
      top_p: Number(model.topP ?? 0.8),
      max_completion_tokens: Number(model.maxCompletionTokens ?? 12000),
      enable_thinking: Boolean(model.enableThinking),
      messages: [
        { role: "system", content: factLayer.systemPrompt },
        {
          role: "user",
          content: `${userPrompt}\n\n字段配置：${JSON.stringify(fieldBrief, null, 2)}\n\n输出格式要求：\n- 只返回 JSON：{"extractedFacts":[]}。\n- extractedFacts 必须与启用字段一一对应，每个启用字段恰好返回一项，不得遗漏、重复或新增字段。\n- 每一项必须包含 key、category、field、value、evidence，并原样返回字段配置中的 key、category 和 field。\n- evidence 必须是数组，数组元素格式为 {"timestamp":"原文时间戳","speaker":"销售或客户","quote":"原文或近似原话","type":"证据类型"}。\n- value 只放字段抽取值，不要把 evidence 放进 value 内部。\n- 客户事实只能引用客户原话，销售行为只能引用销售原话；跨角色对应关系必须同时引用双方证据。\n- 禁止输出 confidence、置信度或其他需要客户逐条解释维护的字段。\n- 找不到明确原文证据时，value 输出“未提及”或空枚举，evidence 输出空数组。`
        }
      ]
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`事实层大模型调用失败：${payload?.error?.message || response.status}`);
  }
  return JSON.parse(payload.choices?.[0]?.message?.content || "{}");
}

function collectEvidence(utterances) {
  return utterances
    .filter((item) => /预算|价格|贵|试驾|家人|老婆|商量|比亚迪|竞品|报价|微信|售后|空间|安全|动力|不急|考虑/.test(item.text))
    .slice(0, 18)
    .map((item) => ({
      id: item.id,
      speaker: item.role,
      quote: item.text,
      timestamp: formatTime(item.startSec),
      type: classifyEvidence(item.text)
    }));
}

function classifyEvidence(text) {
  if (keywords.price.test(text)) return "价格/预算";
  if (keywords.competitor.test(text)) return "竞品";
  if (keywords.decision.test(text)) return "决策链";
  if (keywords.testDrive.test(text)) return "体验/试驾";
  if (keywords.follow.test(text)) return "跟进闭环";
  if (keywords.needs.test(text)) return "需求/关注点";
  return "关键原话";
}

function collectObjections(customer, sales) {
  const salesText = sales.map((item) => item.text).join(" ");
  const map = [
    ["价格异议", keywords.price, "价格"],
    ["竞品异议", keywords.competitor, "竞品"],
    ["家人决策", keywords.decision, "家人决策"],
    ["售后顾虑", keywords.afterSales, "售后顾虑"],
    ["库存交付", keywords.delivery, "库存交付"],
    ["时间不急", /不急|再看看|考虑一下|以后再说/, "时间不急"]
  ];
  return map
    .map(([label, pattern, type]) => {
      const hit = customer.find((item) => pattern.test(item.text));
      if (!hit) return null;
      const handled = inferHandled(type, salesText);
      return {
        type,
        label,
        strength: /多次|一直|太贵|接受不了|不考虑|算了|肯定/.test(hit.text) ? "高" : "中",
        evidence: {
          speaker: hit.role,
          quote: hit.text,
          timestamp: formatTime(hit.startSec)
        },
        handling: handled ? "部分处理" : "未处理"
      };
    })
    .filter(Boolean);
}

function inferHandled(type, salesText) {
  if (type === "价格") return /金融|月供|权益|置换|优惠|拆|方案|总成本/.test(salesText);
  if (type === "竞品") return /对比|配置|差异|需求|维度/.test(salesText);
  if (type === "家人决策") return /家人|一起|再来|复店|资料|发您/.test(salesText);
  if (type === "售后顾虑") return /质保|售后|保养|服务|政策/.test(salesText);
  return /方案|确认|我帮|可以/.test(salesText);
}

function collectConcerns(text) {
  const pairs = [
    ["价格", keywords.price],
    ["空间", /空间|大|小|后排|座椅|老人|孩子/],
    ["安全", /安全|气囊|辅助驾驶|刹车/],
    ["智能", /智能|车机|辅助|自动/],
    ["外观", /外观|颜色|款式|好看/],
    ["续航", /续航|油耗|能耗|电池/],
    ["动力", /动力|加速|发动机/],
    ["售后", keywords.afterSales],
    ["保值", /保值|二手|残值/]
  ];
  const result = pairs.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  return result.length ? result : ["未明确"];
}

function collectCompetitors(text) {
  const result = [];
  for (const name of ["比亚迪", "特斯拉", "理想", "问界", "蔚来", "小鹏", "A品牌", "其他店", "别家"]) {
    if (text.includes(name)) result.push(name);
  }
  if (!result.length && /竞品|对比/.test(text)) result.push("模糊竞品");
  return result;
}

function collectSopActions(salesText, customerText, objections) {
  return {
    asked_use_case: /用途|家用|谁开|主要用|通勤|场景|平时/.test(salesText) || /家用|通勤|接送|商务/.test(customerText),
    asked_budget: /预算|首付|月供|价位|价格接受|多少钱/.test(salesText),
    asked_purchase_timeline: /什么时候|多久|近期|今天|周末|月底|购车时间/.test(salesText) || keywords.purchaseTime.test(customerText),
    asked_decision_maker: /谁决定|家人|老婆|老公|领导|一起看|商量/.test(salesText) || keywords.decision.test(customerText),
    introduced_product_by_need: keywords.needs.test(salesText) && keywords.needs.test(customerText),
    invited_test_drive: keywords.testDrive.test(salesText),
    quoted_price: keywords.quote.test(salesText),
    handled_objection: objections.some((item) => item.handling !== "未处理"),
    confirmed_next_followup: keywords.follow.test(salesText)
  };
}

function inferIntent(customerText, salesText, sop, objections) {
  if (/下订|定了|今天要|刷卡|签合同/.test(customerText + salesText)) return "高意向";
  if ((sop.quoted_price || sop.invited_test_drive) && /报价|试驾|优惠|配置|现车/.test(customerText)) return "中高意向";
  if (objections.length || keywords.price.test(customerText) || keywords.competitor.test(customerText)) return "中意向";
  if (/随便看看|不急|以后再说/.test(customerText)) return "低意向";
  return "中意向";
}

function inferFollowUpValue(intent, objections, sop) {
  if (["高意向", "中高意向"].includes(intent) && (!sop.confirmed_next_followup || objections.length)) return "高优先级";
  if (intent === "中意向") return "普通跟进";
  if (intent === "低意向") return "低优先级";
  return "普通跟进";
}

function inferSalesTags(sop, objections) {
  const done = Object.values(sop).filter(Boolean).length;
  return {
    sopExecution: done >= 7 ? "完成" : done >= 4 ? "部分完成" : "未完成",
    needDiscovery: [sop.asked_use_case, sop.asked_budget, sop.asked_purchase_timeline, sop.asked_decision_maker].filter(Boolean).length >= 3 ? "充分" : "不足",
    productExplanation: sop.introduced_product_by_need ? "匹配需求" : "泛泛讲解",
    objectionHandling: objections.length === 0 ? "一般" : sop.handled_objection ? "一般" : "未处理",
    closing: sop.invited_test_drive || sop.quoted_price ? "主动推进" : "未推进",
    followUpClosure: sop.confirmed_next_followup ? "已确认" : "未确认"
  };
}

function collectRiskSegments(utterances) {
  return utterances
    .filter((item) => /保证最低价|绝对最便宜|一定能批|贷款肯定通过|竞品都不行|投诉|不满意/.test(item.text))
    .map((item) => ({
      riskType: "合规/体验风险",
      speaker: item.role,
      quote: item.text,
      timestamp: formatTime(item.startSec),
      requiresHumanReview: true
    }));
}

function collectCandidateScripts(sales, customer) {
  return sales
    .filter((item) => /您|我帮|可以|建议|因为|所以|方案|对比|试驾|家人|预算/.test(item.text) && item.text.length >= 12)
    .slice(0, 4)
    .map((item) => ({
      scene: classifyEvidence(item.text),
      salesQuote: item.text,
      customerObjection: findNearestCustomerQuote(customer, item.startSec),
      customerReaction: "待结合后续结果验证",
      reason: "候选表达包含解释、建议或推进动作，需店长/内训师审核",
      evidence: { speaker: item.role, quote: item.text, timestamp: formatTime(item.startSec) }
    }));
}

function findNearestCustomerQuote(customer, sec) {
  const nearest = [...customer].sort((a, b) => Math.abs(a.startSec - sec) - Math.abs(b.startSec - sec))[0];
  return nearest?.text || "未匹配到客户问题";
}

function buildExtractedFacts(fields, fact) {
  return fields.map((field) => {
    const value = factValueForField(field.field, fact);
    return {
      key: field.key,
      category: field.category,
      field: field.field,
      meaning: field.meaning,
      modelPrompt: field.modelPrompt,
      outputRequirement: field.outputRequirement,
      value: value.value,
      evidence: value.evidence,
      extractionStatus: value.evidence?.length ? "已提取" : "无明确证据"
    };
  });
}

function sanitizeExtractedFacts(items, fields) {
  return fields.map((field, index) => {
    const rest = items.find((item) => item?.key === field.key || item?.field === field.field) || items[index] || {};
    const rawValue = rest.value ?? "未提取";
    const evidence = normalizeFactEvidence(rest.evidence, rawValue && typeof rawValue === "object" ? rawValue.evidence : null);
    return {
      key: field.key || rest.key || `fact_${index + 1}`,
      category: field.category || rest.category || "未分组",
      field: field.field || rest.field || `字段${index + 1}`,
      meaning: rest.meaning || field.meaning || "",
      modelPrompt: field.modelPrompt || rest.modelPrompt || "",
      outputRequirement: field.outputRequirement || rest.outputRequirement || "",
      value: stripFactValueMeta(rawValue),
      evidence,
      extractionStatus: evidence.length ? "已提取" : "无明确证据"
    };
  });
}

function stripFactValueMeta(value) {
  if (Array.isArray(value)) return value.map((item) => stripFactValueMeta(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !["evidence", "confidence", "置信度"].includes(key))
      .map(([key, item]) => [key, stripFactValueMeta(item)])
  );
}

function normalizeFactEvidence(...sources) {
  return sources.flatMap((source) => evidenceFromSource(source)).filter((item) => item.quote);
}

function evidenceFromSource(source) {
  if (!source) return [];
  if (typeof source === "string") return evidenceFromText(source);
  if (Array.isArray(source)) return source.flatMap((item) => evidenceFromSource(item));
  if (typeof source === "object") {
    const quote = String(source.quote || source.text || source.evidence || "").trim();
    if (!quote) return [];
    return [{
      timestamp: String(source.timestamp || source.time || ""),
      speaker: String(source.speaker || source.role || "原文"),
      quote,
      type: String(source.type || source.riskType || "原文证据")
    }];
  }
  return [];
}

function evidenceFromText(text) {
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

function applyExtractedFactsToFactPackage(fact, rules = loadAnalysisConfig()) {
  const facts = Array.isArray(fact.extractedFacts) ? fact.extractedFacts : [];
  const valueByField = (fieldName) => facts.find((item) => item.field === fieldName)?.value || {};
  const assign = (target, key, value) => {
    if (!isMeaningfulFactValue(value)) return;
    target[key] = value;
  };

  const extractedEvidence = facts.flatMap((item) => normalizeFactEvidence(item.evidence));
  fact.evidence = dedupeEvidence([...(fact.evidence || []), ...extractedEvidence]);
  fact.signalFacts = Object.fromEntries(facts.map((item) => [item.field, item.value]));

  applyAtomicSignalFacts(fact, valueByField);

  const scene = valueByField("会话场景");
  assign(fact.conversation, "mainScene", scene.main_scene);

  const useCase = valueByField("用车/购买场景");
  assign(fact.customerProfile, "useCase", useCase.use_case);

  const budget = valueByField("预算信息");
  assign(fact.customerProfile, "budgetValue", budget.budget_value);
  assign(fact.customerTags, "priceSensitivity", budget.price_sensitivity);

  const timeline = valueByField("购车/购买周期");
  assign(fact.customerProfile, "purchaseTimeline", timeline.purchase_timeline);
  assign(fact.customerTags, "urgencyLevel", timeline.urgency_level);

  const decision = valueByField("决策人/影响人");
  assign(fact.customerProfile, "decisionMakers", toList(decision.decision_makers));
  assign(fact.customerProfile, "decisionChainStatus", decision.decision_chain_status);

  const concerns = valueByField("关注点");
  assign(fact.customerTags, "concerns", toList(concerns.concerns));

  const competitors = valueByField("竞品信息");
  assign(fact.customerProfile, "competitors", toList(competitors.competitors));
  assign(fact.customerProfile, "comparisonDimension", competitors.comparison_dimension);

  const explicitObjections = valueByField("显性异议");
  const explicitLabels = toList(explicitObjections.explicit_objections);
  if (explicitLabels.length) {
    fact.customerTags.objections = explicitLabels;
    fact.customerObjections = explicitLabels.map((label) => ({
      type: label,
      label,
      strength: explicitObjections.strength || "中",
      evidence: normalizeFactEvidence(explicitObjections.evidence)[0] || null,
      handling: "待诊断"
    }));
  }

  const objectionHandling = valueByField("异议处理情况");
  if (Array.isArray(objectionHandling.objection_handling)) {
    fact.customerObjections = objectionHandling.objection_handling.map((item) => ({
      type: item.objection || item.type || "异议",
      label: item.objection || item.type || "异议",
      strength: explicitObjections.strength || "中",
      evidence: normalizeFactEvidence(item.evidence)[0] || null,
      handling: item.handling || "待诊断"
    }));
    fact.customerTags.objections = fact.customerObjections.map((item) => item.type);
  }

  const intent = valueByField("意向等级");
  assign(fact.customerTags, "intentLevel", normalizeIntentLevel(intent.intent_level));

  const follow = valueByField("是否可跟进");
  assign(fact.customerTags, "followUpValue", follow.follow_up_value);

  const sop = valueByField("SOP动作完成情况");
  const mappedSop = mapExtractedSopActions(sop.sop_actions);
  if (Object.keys(mappedSop).length) {
    fact.sopActions = { ...fact.sopActions, ...mappedSop };
    fact.salesTags = inferSalesTags(fact.sopActions, fact.customerObjections || []);
  }

  const risk = valueByField("高风险片段");
  if (Array.isArray(risk.risk_segments)) {
    fact.riskSegments = risk.risk_segments.map((item) => ({
      riskType: item.type || item.riskType || "风险片段",
      quote: item.quote || "",
      speaker: item.speaker || "原文",
      timestamp: item.timestamp || "",
      requiresHumanReview: true
    })).filter((item) => item.quote);
  }

  const scripts = valueByField("候选优秀话术");
  if (Array.isArray(scripts.candidate_scripts)) {
    fact.candidateScripts = scripts.candidate_scripts.map((item) => ({
      scene: item.scenario || item.scene || "候选话术",
      salesQuote: item.sales_response || item.salesQuote || "",
      customerObjection: item.customer_question || item.customerObjection || "",
      customerReaction: "待结合后续结果验证",
      reason: item.reason || "需人工审核后入库",
      evidence: normalizeFactEvidence(item.evidence)[0] || null
    }));
  }

  deriveRuleDrivenResults(fact, rules.diagnosisLayer?.derivedRules, rules.customerInsightRules);
  fact.decisionFactTable = buildDecisionFactTable(fact);
  fact.conversation.conclusion = inferConclusionFromFact(fact);
}

function buildDecisionFactTable(fact) {
  const rows = [];
  const add = (factCode, fieldName, category, value, status, source, evidence, downstreamUses) => {
    rows.push({
      factCode,
      fieldName,
      category,
      value,
      status,
      source,
      evidence: dedupeEvidence(normalizeFactEvidence(evidence)).slice(0, 8),
      downstreamUses
    });
  };
  const profile = fact.customerProfile || {};
  const tags = fact.customerTags || {};
  const sop = fact.sopActions || {};
  const extractedEvidence = (fieldName) => normalizeFactEvidence((fact.extractedFacts || []).find((item) => item.field === fieldName)?.evidence);
  const textStatus = (value) => isMeaningfulFactValue(value) ? "已明确" : "未明确";
  const listStatus = (value) => toList(value).length ? "已明确" : "未明确";
  const budgetText = String(profile.budgetValue || "").trim();
  const budgetStatus = !isMeaningfulFactValue(budgetText)
    ? "未明确"
    : /未明确|没有明确|不确定|大概|左右|约/.test(budgetText)
      ? "部分明确"
      : "已明确";

  const needEvidence = extractedEvidence("客户需求与约束");
  add("customer.use_case", "用途/使用场景", "客户事实", profile.useCase || "未提及", textStatus(profile.useCase), "事实层大模型", textStatus(profile.useCase) === "已明确" ? needEvidence : [], ["客户洞察", "需求确认诊断", "车型方案匹配"]);
  add("customer.budget", "预算/价格范围", "客户事实", profile.budgetValue || "未提及", budgetStatus, "事实层大模型", budgetStatus !== "未明确" ? needEvidence : [], ["客户洞察", "预算确认诊断", "报价策略"]);
  add("customer.concerns", "核心关注点", "客户事实", toList(tags.concerns).join("、") || "未提及", listStatus(tags.concerns), "事实层大模型", listStatus(tags.concerns) === "已明确" ? needEvidence : [], ["客户洞察", "产品讲解匹配", "跟进内容生成"]);
  add("customer.decision_maker", "决策人/影响人", "客户事实", toList(profile.decisionMakers).join("、") || "未提及", listStatus(profile.decisionMakers), "事实层大模型", listStatus(profile.decisionMakers) === "已明确" ? needEvidence : [], ["客户洞察", "决策链诊断", "跟进对象选择"]);
  add("customer.purchase_timeline", "购车周期", "客户事实", profile.purchaseTimeline || "未提及", textStatus(profile.purchaseTimeline), "事实层大模型", textStatus(profile.purchaseTimeline) === "已明确" ? needEvidence : [], ["客户洞察", "购车周期诊断", "跟进时机"]);
  add("customer.competitors", "竞品", "客户事实", toList(profile.competitors).join("、") || "未提及", listStatus(profile.competitors), "事实层大模型", listStatus(profile.competitors) === "已明确" ? needEvidence : [], ["客户洞察", "竞品异议诊断", "竞品策略"]);
  add("customer.objections", "客户异议", "客户事实", (fact.customerObjections || []).map((item) => item.type).join("、") || "未提及", (fact.customerObjections || []).length ? "已明确" : "未明确", "事实层大模型", extractedEvidence("客户异议事实"), ["客户洞察", "异议处理诊断", "异议策略"]);

  const salesActions = [
    ["sales.ask_use_case", "销售询问用途", sop.asked_use_case, "销售需求挖掘行为"],
    ["sales.ask_budget", "销售询问预算", sop.asked_budget, "销售需求挖掘行为"],
    ["sales.ask_purchase_timeline", "销售询问购车周期", sop.asked_purchase_timeline, "销售需求挖掘行为"],
    ["sales.ask_decision_maker", "销售询问决策人", sop.asked_decision_maker, "销售需求挖掘行为"],
    ["sales.explain_by_need", "销售结合需求讲解", sop.introduced_product_by_need, "销售讲解与异议回应"],
    ["sales.invite_test_drive", "销售邀约试驾", sop.invited_test_drive, "销售推进与跟进约定"],
    ["sales.quote_price", "销售报价", sop.quoted_price, "销售推进与跟进约定"],
    ["sales.handle_objection", "销售处理异议", sop.handled_objection, "销售讲解与异议回应"],
    ["sales.confirm_followup", "销售确认下一步跟进", sop.confirmed_next_followup, "销售推进与跟进约定"]
  ];
  for (const [code, name, done, sourceField] of salesActions) {
    add(code, name, "销售行为事实", done ? "已执行" : "未发现明确动作", done ? "已执行" : "未执行", "事实层大模型", extractedEvidence(sourceField), ["SOP质检", "销售能力诊断", "策略匹配"]);
  }
  return rows;
}

const FACT_CORRECTION_BINDINGS = {
  "customer.use_case": { kind: "text", target: ["customerProfile", "useCase"] },
  "customer.budget": { kind: "text", target: ["customerProfile", "budgetValue"] },
  "customer.concerns": { kind: "list", target: ["customerTags", "concerns"] },
  "customer.decision_maker": { kind: "list", target: ["customerProfile", "decisionMakers"] },
  "customer.purchase_timeline": { kind: "text", target: ["customerProfile", "purchaseTimeline"] },
  "customer.competitors": { kind: "list", target: ["customerProfile", "competitors"] },
  "customer.objections": { kind: "objections" },
  "sales.ask_use_case": { kind: "boolean", target: ["sopActions", "asked_use_case"] },
  "sales.ask_budget": { kind: "boolean", target: ["sopActions", "asked_budget"] },
  "sales.ask_purchase_timeline": { kind: "boolean", target: ["sopActions", "asked_purchase_timeline"] },
  "sales.ask_decision_maker": { kind: "boolean", target: ["sopActions", "asked_decision_maker"] },
  "sales.explain_by_need": { kind: "boolean", target: ["sopActions", "introduced_product_by_need"] },
  "sales.invite_test_drive": { kind: "boolean", target: ["sopActions", "invited_test_drive"] },
  "sales.quote_price": { kind: "boolean", target: ["sopActions", "quoted_price"] },
  "sales.handle_objection": { kind: "boolean", target: ["sopActions", "handled_objection"] },
  "sales.confirm_followup": { kind: "boolean", target: ["sopActions", "confirmed_next_followup"] }
};

function applyFactCorrections(fact, corrections, rules) {
  if (!Array.isArray(corrections) || !corrections.length) return;
  fact.customerProfile ||= {};
  fact.customerTags ||= {};
  fact.sopActions ||= {};

  for (const correction of corrections) {
    const binding = FACT_CORRECTION_BINDINGS[correction.factCode];
    if (!binding) continue;
    const missing = correction.status === "未明确" || correction.status === "未执行";
    if (binding.kind === "boolean") {
      fact[binding.target[0]][binding.target[1]] = correction.status === "已执行";
      continue;
    }
    if (binding.kind === "objections") {
      const labels = missing ? [] : splitFactList(correction.value);
      const previous = Array.isArray(fact.customerObjections) ? fact.customerObjections : [];
      fact.customerObjections = labels.map((label) => previous.find((item) => item.type === label) || {
        type: label,
        label,
        strength: "待规则计算",
        handling: "待规则计算",
        evidence: null
      });
      fact.customerTags.objections = labels;
      continue;
    }
    const value = missing ? (binding.kind === "list" ? [] : "未提及") : correction.value;
    fact[binding.target[0]][binding.target[1]] = binding.kind === "list" ? splitFactList(value) : value;
    if (correction.factCode === "customer.decision_maker") {
      fact.customerProfile.decisionChainStatus = missing ? "未明确" : "已识别决策人/影响人";
    }
  }

  fact.salesTags = inferSalesTags(fact.sopActions, fact.customerObjections || []);
  deriveRuleDrivenResults(fact, rules.diagnosisLayer?.derivedRules, rules.customerInsightRules);
  fact.decisionFactTable = buildDecisionFactTable(fact);
  const correctionByCode = new Map(corrections.map((item) => [item.factCode, item]));
  fact.decisionFactTable = fact.decisionFactTable.map((row) => {
    const correction = correctionByCode.get(row.factCode);
    if (!correction) return row;
    return {
      ...row,
      value: correction.value || (correction.status === "已执行" ? "已执行" : correction.status === "未执行" ? "未发现明确动作" : "未提及"),
      status: correction.status || row.status,
      source: "人工修正"
    };
  });
  fact.conversation.conclusion = inferConclusionFromFact(fact);
}

function splitFactList(value) {
  if (Array.isArray(value)) return uniqueStrings(value);
  return uniqueStrings(String(value || "").split(/[、,，;；/]/).map((item) => item.trim()).filter(Boolean));
}

function factTableRow(fact, factCode) {
  return (fact.decisionFactTable || buildDecisionFactTable(fact)).find((item) => item.factCode === factCode);
}

function buildNeedConfirmationDiagnosis(fact) {
  const dimensions = [
    ["用途", "customer.use_case", "sales.ask_use_case"],
    ["预算/价格范围", "customer.budget", "sales.ask_budget"],
    ["核心关注点", "customer.concerns", null],
    ["决策人", "customer.decision_maker", "sales.ask_decision_maker"],
    ["购车周期", "customer.purchase_timeline", "sales.ask_purchase_timeline"]
  ].map(([label, customerCode, salesCode]) => ({
    label,
    customer: factTableRow(fact, customerCode),
    sales: salesCode ? factTableRow(fact, salesCode) : null
  }));
  const known = dimensions.filter((item) => item.customer?.status === "已明确").map((item) => item.label);
  const partial = dimensions.filter((item) => item.customer?.status === "部分明确").map((item) => item.label);
  const missing = dimensions.filter((item) => item.customer?.status === "未明确").map((item) => item.label);
  const unconfirmed = dimensions.filter((item) => item.sales && item.sales.status !== "已执行").map((item) => item.label);
  const clauses = [];
  if (known.length) clauses.push(`客户事实已明确：${known.join("、")}`);
  if (partial.length) clauses.push(`部分明确：${partial.join("、")}`);
  if (missing.length) clauses.push(`仍未明确：${missing.join("、")}`);
  if (unconfirmed.length) clauses.push(`销售未主动询问或复述确认：${unconfirmed.join("、")}`);
  return {
    issue: "销售需求确认不足",
    reason: `${clauses.join("；")}。该诊断评价销售确认动作，不否定客户已经主动表达的事实。`,
    known,
    partial,
    missing,
    unconfirmed,
    evidence: dimensions.flatMap((item) => item.customer?.evidence || [])
  };
}

function applyAtomicSignalFacts(fact, valueByField) {
  const scene = valueByField("场景事实");
  const sceneTypes = toTextList(firstValue(scene, ["scene_types", "场景类型"]));
  if (sceneTypes.length) fact.conversation.mainScene = sceneTypes.join("、");

  const configuredNeeds = valueByField("客户需求与约束");
  const needs = Object.keys(configuredNeeds).length ? configuredNeeds : valueByField("需求挖掘质量");
  const rawNeedFacts = needs.customer_need_facts || needs.customerFacts || needs.客户需求事实;
  const needFacts = { ...objectValue(rawNeedFacts), ...configuredNeeds };
  for (const item of listValue(rawNeedFacts)) {
    const row = objectValue(item);
    const type = String(firstValue(row, ["type", "fact_type", "类型"]) || "");
    const content = firstValue(row, ["content", "value", "事实内容"]);
    if (/用途|场景/.test(type)) assignMeaningful(fact.customerProfile, "useCase", content);
    if (/预算|价格/.test(type)) assignMeaningful(fact.customerProfile, "budgetValue", content);
    if (/时间|周期/.test(type)) assignMeaningful(fact.customerProfile, "purchaseTimeline", content);
    if (/决策|影响人/.test(type)) fact.customerProfile.decisionMakers = uniqueStrings([...fact.customerProfile.decisionMakers, ...toList(content)]);
    if (/关注/.test(type)) fact.customerTags.concerns = uniqueStrings([...fact.customerTags.concerns, ...toList(content)]);
    if (/竞品/.test(type)) fact.customerProfile.competitors = uniqueStrings([...fact.customerProfile.competitors, ...toList(content)]);
  }
  assignMeaningful(fact.customerProfile, "useCase", firstValue(needFacts, ["use_case", "使用场景", "用途"]));
  assignMeaningful(fact.customerProfile, "budgetValue", firstValue(needFacts, ["budget", "budget_value", "预算"]));
  assignMeaningful(fact.customerProfile, "purchaseTimeline", firstValue(needFacts, ["purchase_timeline", "购买时间", "购买周期"]));
  const decisionMakers = toList(firstValue(needFacts, ["decision_makers", "决策人", "影响人"]));
  if (decisionMakers.length) fact.customerProfile.decisionMakers = decisionMakers;
  const concerns = toList(firstValue(needFacts, ["concerns", "核心关注点", "关注点"]));
  if (concerns.length) fact.customerTags.concerns = concerns;
  const competitors = toList(firstValue(needFacts, ["competitors", "竞品"]));
  if (competitors.length) fact.customerProfile.competitors = competitors;
  const discovery = valueByField("销售需求挖掘行为");
  const rawQuestionActions = discovery.sales_question_actions || discovery.salesQuestions || discovery.销售询问动作 || needs.sales_question_actions || needs.salesQuestions || needs.销售询问动作;
  const questionActions = objectValue(rawQuestionActions);
  const mappedQuestions = { ...mapExtractedSopActions(questionActions), ...mapQuestionActions(listValue(rawQuestionActions)) };
  if (Object.keys(mappedQuestions).length) fact.sopActions = { ...fact.sopActions, ...mappedQuestions };

  const configuredExplanation = valueByField("销售讲解与异议回应");
  const product = Object.keys(configuredExplanation).length ? configuredExplanation : valueByField("产品讲解匹配度");
  const pairs = listValue(product.requirement_explanation_pairs || product.matched_pairs || product.需求讲解对应关系);
  const requirements = toList(product.customer_requirements || product.客户需求);
  if (requirements.length) fact.customerTags.concerns = uniqueStrings([...(fact.customerTags.concerns || []), ...requirements]);
  if (pairs.length) fact.sopActions.introduced_product_by_need = true;

  const objectionFacts = valueByField("客户异议事实");
  const objectionSource = Object.keys(objectionFacts).length ? objectionFacts : valueByField("异议强度");
  let objectionSignals = listValue(firstValue(objectionSource, ["objections", "异议"]));
  if (!objectionSignals.length && isMeaningfulFactValue(firstValue(objectionSource, ["异议类型", "objection_type", "type"]))) {
    objectionSignals = [{
      type: firstValue(objectionSource, ["异议类型", "objection_type", "type"]),
      expression: firstValue(objectionSource, ["原话", "异议原话", "expression", "quote"]),
      occurrence_count: firstValue(objectionSource, ["出现次数", "occurrence_count"]),
      explicit_refusal: firstValue(objectionSource, ["明确拒绝", "explicit_refusal"]),
      blocked_actions: firstValue(objectionSource, ["阻碍动作", "blocked_actions"]),
      evidence: (fact.extractedFacts || []).find((item) => item.field === "客户异议事实")?.evidence
    }];
  }
  if (objectionSignals.length) {
    fact.customerObjections = objectionSignals.flatMap((item) => {
      const row = objectValue(item);
      const types = expandObjectionTypes(firstValue(row, ["type", "objection_type", "异议类型"]) || "其他异议");
      return types.map((type) => ({
        type,
        label: type,
        strength: "待规则计算",
        handling: "待规则计算",
        evidence: normalizeFactEvidence(row.evidence)[0] || findEvidenceForText(fact.evidence, firstValue(row, ["expression", "quote", "异议原话"])),
        signals: {
          occurrenceCount: Number(firstValue(row, ["occurrence_count", "出现次数"]) || 1),
          explicitRefusal: booleanValue(firstValue(row, ["explicit_refusal", "明确拒绝"])),
          blockedActions: toList(firstValue(row, ["blocked_actions", "阻碍动作"]))
        }
      }));
    });
    fact.customerTags.objections = fact.customerObjections.map((item) => item.type);
  }

  let responseRows = listValue(firstValue(product, ["objection_responses", "异议回应列表"]));
  if (!responseRows.length && isMeaningfulFactValue(firstValue(product, ["异议回应", "销售讲解"]))) {
    responseRows = [{
      objection_type: firstValue(objectionSource, ["异议类型", "objection_type", "type"]),
      response_actions: firstValue(product, ["异议回应", "销售讲解"]),
      customer_reaction: firstValue(product, ["客户反应"])
    }];
  }
  for (const response of responseRows) {
    const row = objectValue(response);
    const types = expandObjectionTypes(firstValue(row, ["objection_type", "type", "异议类型"]) || "其他异议");
    for (const type of types) {
      const target = fact.customerObjections.find((item) => item.type === type);
      if (!target) continue;
      target.responseActions = toList(firstValue(row, ["response_actions", "回应动作"]));
      target.customerReaction = firstValue(row, ["customer_reaction", "客户反应"]);
    }
  }

  const configuredClosing = valueByField("销售推进与跟进约定");
  const closing = Object.keys(configuredClosing).length ? configuredClosing : valueByField("成交推进动作");
  const completedActions = toTextList(closing.completed_actions || closing.已完成动作);
  fact.sopActions = { ...fact.sopActions, ...mapCompletedActions(completedActions) };

  const followup = Object.keys(configuredClosing).length ? configuredClosing : valueByField("跟进闭环");
  fact.followUpFacts = {
    offer: firstValue(followup, ["follow_up_offer", "跟进提议", "next_step_action", "下一步动作"]),
    time: firstValue(followup, ["followup_time", "time", "跟进时间"]),
    channel: firstValue(followup, ["channel", "联系渠道"]),
    customerAgreement: firstValue(followup, ["customer_response", "客户回应", "customer_agreement", "客户是否同意"])
  };
  const hasContactArrangement = isMeaningfulFactValue(fact.followUpFacts.channel) || isMeaningfulFactValue(fact.followUpFacts.time) || /联系|发送|邀约|回访|复店|跟进/.test(String(fact.followUpFacts.offer || ""));
  if (hasContactArrangement && isPositiveAgreement(fact.followUpFacts.customerAgreement)) fact.sopActions.confirmed_next_followup = true;

  const observed = objectValue(valueByField("销售不足").observed_sop_actions);
  const mappedObserved = mapExtractedSopActions(observed);
  if (Object.keys(mappedObserved).length) fact.sopActions = { ...fact.sopActions, ...mappedObserved };

  fact.positiveBehaviorCandidates = listValue(product.positive_behavior_candidates || valueByField("销售亮点").positive_behavior_candidates);
  const purchaseFacts = valueByField("客户购买与阻塞信号");
  const followUpValue = Object.keys(purchaseFacts).length ? purchaseFacts : valueByField("是否可跟进");
  fact.followUpSignals = objectValue(followUpValue.follow_up_signals || followUpValue);
  const intent = Object.keys(purchaseFacts).length ? purchaseFacts : valueByField("意向等级");
  fact.intentSignals = {
    purchase: toTextList(intent.purchase_signals || intent.正向购买信号),
    blocking: toTextList(intent.blocking_signals || intent.阻塞信号)
  };
}

function deriveRuleDrivenResults(fact, diagnosisRules = {}, insightRules = {}) {
  const needRule = diagnosisRules?.needDiscovery || {};
  const needCount = [fact.sopActions.asked_use_case, fact.sopActions.asked_budget, fact.sopActions.asked_purchase_timeline, fact.sopActions.asked_decision_maker].filter(Boolean).length;
  const needQuality = needCount >= Number(needRule.sufficientMin ?? 3) ? "充分" : needCount >= Number(needRule.generalMin ?? 2) ? "一般" : "不足";

  const explanationFacts = fact.signalFacts?.["销售讲解与异议回应"] || fact.signalFacts?.["产品讲解匹配度"] || {};
  const productPairs = listValue(explanationFacts.requirement_explanation_pairs);
  const productRequirements = toList(explanationFacts.customer_requirements);
  const productMatch = productPairs.length >= Number(diagnosisRules?.productExplanation?.matchedPairMin ?? 1)
    ? "匹配需求"
    : productRequirements.length
      ? "未发现对应讲解"
      : "信息不足";

  const effectiveActionMin = Number(diagnosisRules?.objectionHandling?.effectiveActionMin ?? 2);
  for (const objection of fact.customerObjections || []) {
    objection.strength = deriveObjectionStrength(objection.signals, insightRules?.objectionStrength);
    const actionCount = Array.isArray(objection.responseActions) ? objection.responseActions.length : 0;
    objection.handling = actionCount >= effectiveActionMin ? "有效处理" : actionCount > 0 ? "部分处理" : "未处理";
  }
  fact.sopActions.handled_objection = (fact.customerObjections || []).some((item) => item.handling === "有效处理");

  const follow = fact.followUpFacts || {};
  const requiredElements = diagnosisRules?.followUpClosure?.requiredElements || ["follow_up_offer", "followup_time", "customer_response"];
  const validFollowUpOffer = isMeaningfulFactValue(follow.offer) && (/联系|发送|邀约|回访|复店|跟进/.test(String(follow.offer)) || isMeaningfulFactValue(follow.channel));
  const followValueMap = {
    follow_up_offer: validFollowUpOffer ? follow.offer : "",
    followup_time: validFollowUpOffer ? follow.time : "",
    customer_response: validFollowUpOffer && isPositiveAgreement(follow.customerAgreement) ? follow.customerAgreement : "",
    channel: validFollowUpOffer ? follow.channel : ""
  };
  const followCount = requiredElements.filter((key) => isMeaningfulFactValue(followValueMap[key])).length;
  const followClosure = followCount === requiredElements.length ? "已闭环" : followCount > 0 ? "部分闭环" : "未闭环";
  fact.sopActions.confirmed_next_followup = followClosure !== "未闭环";

  const completedClosing = Object.entries({ 邀约试驾: fact.sopActions.invited_test_drive, 报价: fact.sopActions.quoted_price, 异议处理: fact.sopActions.handled_objection, 跟进约定: fact.sopActions.confirmed_next_followup })
    .filter(([, done]) => done).map(([label]) => label);
  const closingResult = completedClosing.length ? completedClosing.join("、") : "未发现明确推进动作";

  const intent = deriveIntentLevel(fact, insightRules?.intent);
  const followUpValue = deriveFollowUpValue(fact, intent.level, insightRules?.followUp);
  fact.customerTags.intentLevel = intent.level;
  fact.customerTags.followUpValue = followUpValue;

  const missingLabels = Object.entries({ 询问用途: fact.sopActions.asked_use_case, 询问预算: fact.sopActions.asked_budget, 询问购买周期: fact.sopActions.asked_purchase_timeline, 询问决策人: fact.sopActions.asked_decision_maker, 结合需求讲解: fact.sopActions.introduced_product_by_need, 邀约试驾: fact.sopActions.invited_test_drive, 报价: fact.sopActions.quoted_price, 处理异议: fact.sopActions.handled_objection, 确认跟进: fact.sopActions.confirmed_next_followup })
    .filter(([, done]) => !done).map(([label]) => label);
  const strengths = uniqueStrings([
    ...listValue(fact.positiveBehaviorCandidates).map((item) => String(firstValue(objectValue(item), ["behavior", "行为"]) || item)),
    ...(needQuality === "充分" ? ["需求挖掘充分"] : []),
    ...(productMatch === "匹配需求" ? ["产品讲解匹配需求"] : []),
    ...((fact.customerObjections || []).some((item) => item.handling === "有效处理") ? ["有效处理客户异议"] : []),
    ...(followClosure === "已闭环" ? ["跟进安排完整"] : [])
  ]).slice(0, Number(diagnosisRules?.strengthSummary?.maxItems ?? 3));
  const weaknesses = missingLabels.slice(0, Number(diagnosisRules?.weaknessSummary?.maxItems ?? 5));

  fact.salesTags = {
    ...fact.salesTags,
    needDiscovery: needQuality,
    productExplanation: productMatch,
    objectionHandling: (fact.customerObjections || []).length ? ((fact.customerObjections || []).every((item) => item.handling === "有效处理") ? "有效" : (fact.customerObjections || []).some((item) => item.handling !== "未处理") ? "一般" : "未处理") : "不适用",
    closing: completedClosing.length ? "主动推进" : "未推进",
    followUpClosure: followClosure
  };
  fact.derivedResults = {
    needDiscoveryQuality: needQuality,
    productExplanationMatch: productMatch,
    objectionStrength: (fact.customerObjections || []).map((item) => `${item.type}：${item.strength}`).join("；") || "无明确异议",
    objectionHandling: (fact.customerObjections || []).map((item) => `${item.type}：${item.handling}`).join("；") || "不适用",
    closingActions: closingResult,
    followUpClosure: followClosure,
    salesStrengths: strengths.length ? strengths : ["暂无达到规则条件的明确亮点"],
    salesWeaknesses: weaknesses.length ? weaknesses : ["暂无规则命中的明显不足"],
    followUpValue,
    intentLevel: intent.level,
    intentScore: intent.score,
    intentReasons: intent.reasons
  };
}

function deriveObjectionStrength(signals = {}, rule = {}) {
  if (signals?.explicitRefusal || (signals?.blockedActions || []).length >= Number(rule?.highBlockedActionMin ?? 1)) return "高";
  if (Number(signals?.occurrenceCount || 0) >= Number(rule?.highOccurrenceMin ?? 2)) return "中";
  return "低";
}

function deriveIntentLevel(fact, rule = {}) {
  const weights = rule?.weights || {};
  const purchaseText = (fact.intentSignals?.purchase || []).join(" ");
  const blockingText = (fact.intentSignals?.blocking || []).join(" ");
  const closingFacts = fact.signalFacts?.["销售推进与跟进约定"] || fact.signalFacts?.["成交推进动作"] || {};
  const needFacts = fact.signalFacts?.["客户需求与约束"] || fact.signalFacts?.["需求挖掘质量"] || {};
  const closingText = toTextList(closingFacts.completed_actions).join(" ");
  const needText = [
    ...toTextList(needFacts.customer_need_facts),
    ...toTextList(needFacts.use_case),
    ...toTextList(needFacts.budget),
    ...toTextList(needFacts.concerns)
  ].join(" ");
  const reasons = [];
  let score = 0;
  const add = (matched, key, label) => {
    if (!matched) return;
    score += Number(weights[key] ?? 0);
    reasons.push(label);
  };
  add(/下订|订金|定金|下单|签合同|刷卡/.test(`${purchaseText} ${closingText}`), "order_or_deposit", "出现下订或成交信号");
  add(/购买时间|今天购买|本周购买|近期购买|月底购买|一个月内|尽快购买/.test(purchaseText), "near_purchase_timeline", "购买时间较明确");
  add(/询价|报价|落地价|优惠|首付|月供/.test(`${purchaseText} ${closingText}`) || fact.sopActions.quoted_price, "quote_or_discount", "进入报价或优惠沟通");
  add(/试驾|体验/.test(`${purchaseText} ${closingText}`) || fact.sopActions.invited_test_drive, "test_drive", "出现试驾或体验信号");
  add(fact.sopActions.confirmed_next_followup && isPositiveAgreement(fact.followUpFacts?.customerAgreement), "next_step_agreed", "客户接受下一步安排");
  add(/需求明确|预算明确|使用场景|用途|预算|家用|通勤|商务/.test(`${purchaseText} ${needText}`), "clear_need_or_budget", "需求或预算有明确表达");
  add(/明确拒绝|不要了|不考虑|停止联系|别联系/.test(blockingText), "explicit_refusal", "客户明确拒绝");
  add(/没有需求|无购买需求|无效接待/.test(blockingText), "no_purchase_need", "未发现真实购买需求");
  const level = score >= Number(rule?.highMin ?? 7) ? "高意向" : score >= Number(rule?.mediumHighMin ?? 4) ? "中高意向" : score >= Number(rule?.mediumMin ?? 1) ? "中意向" : score < 0 ? "低意向" : "无法判断";
  return { level, score, reasons };
}

function deriveFollowUpValue(fact, intentLevel, rule = {}) {
  const signalText = JSON.stringify(fact.followUpSignals || {});
  if (rule?.stopOnNoContactRequest !== false && /停止联系|不要联系|拒绝联系/.test(signalText)) return "不可跟进";
  if (rule?.stopOnInvalidReception !== false && /无效|非销售接待/.test(signalText)) return "不可跟进";
  if ((rule?.highIntentLevels || ["高意向", "中高意向"]).includes(intentLevel)) return "高优先级";
  if (intentLevel === "中意向") return "普通跟进";
  if (intentLevel === "低意向") return "低优先级";
  return "信息不足";
}

function mapCompletedActions(actions) {
  const text = actions.join(" ");
  return {
    invited_test_drive: /试驾|体验/.test(text),
    quoted_price: /已报价|给出报价|报价金额|落地价为|首付\s*\d|月供\s*\d|优惠\s*\d|\d+(?:\.\d+)?\s*(万|元)/.test(text),
    confirmed_next_followup: /联系|复店|到店|留资|下一步/.test(text)
  };
}

function mapQuestionActions(actions) {
  const text = actions.map((item) => {
    const row = objectValue(item);
    return [row.question_type, row.target, row.type, row.quote, row.content, toTextValue(item)].filter(Boolean).join(" ");
  }).join(" ");
  return {
    asked_use_case: /使用场景|用途|用车场景/.test(text),
    asked_budget: /预算|价格承受|首付|月供/.test(text),
    asked_purchase_timeline: /购买时间|购车周期|购买周期/.test(text),
    asked_decision_maker: /决策人|影响人|谁决定|家人参与/.test(text)
  };
}

function normalizeObjectionType(value) {
  const text = String(value || "");
  if (/价格|预算|优惠|金融/.test(text)) return "价格";
  if (/竞品|品牌|其他店|别家/.test(text)) return "竞品";
  if (/家人|决策|领导|商量/.test(text)) return "家人决策";
  if (/售后|质保|维修/.test(text)) return "售后顾虑";
  if (/交付|库存|现车/.test(text)) return "库存交付";
  if (/时间|不急|再看/.test(text)) return "时间不急";
  return text || "其他异议";
}

function expandObjectionTypes(value) {
  const text = String(value || "");
  const types = [];
  if (/价格|预算|优惠|金融/.test(text)) types.push("价格");
  if (/竞品|品牌|其他店|别家/.test(text)) types.push("竞品");
  if (/家人|决策|领导|商量/.test(text)) types.push("家人决策");
  if (/售后|质保|维修/.test(text)) types.push("售后顾虑");
  if (/交付|库存|现车/.test(text)) types.push("库存交付");
  if (/时间|不急|再看/.test(text)) types.push("时间不急");
  return types.length ? uniqueStrings(types) : [normalizeObjectionType(text)];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function listValue(value) {
  if (!value || value === "未提及") return [];
  return Array.isArray(value) ? value : [value];
}

function toTextList(value) {
  return listValue(value).map((item) => toTextValue(item)).filter(Boolean);
}

function toTextValue(value) {
  if (value == null) return "";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map((item) => toTextValue(item)).filter(Boolean).join(" ");
  return Object.entries(value)
    .filter(([key]) => !["evidence", "timestamp", "speaker", "quote"].includes(key))
    .map(([, item]) => toTextValue(item))
    .filter(Boolean)
    .join(" ");
}

function firstValue(object, keys) {
  for (const key of keys) if (object?.[key] != null && object[key] !== "") return object[key];
  return "";
}

function assignMeaningful(target, key, value) {
  if (isMeaningfulFactValue(value)) target[key] = value;
}

function booleanValue(value) {
  return value === true || ["true", "是", "已明确", "明确拒绝"].includes(String(value).trim());
}

function isPositiveAgreement(value) {
  const text = String(value || "").trim();
  if (!text || /未|不|否|没有|不明确/.test(text)) return false;
  return value === true || /同意|可以|确认|接受|已约定/.test(text);
}

function uniqueStrings(values) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))];
}

function findEvidenceForText(evidence, text) {
  const target = String(text || "").trim();
  if (!target) return null;
  return evidence.find((item) => item.quote.includes(target) || target.includes(item.quote)) || null;
}

function dedupeEvidence(evidence) {
  const seen = new Set();
  return evidence.filter((item) => {
    const key = `${item.timestamp}|${item.speaker}|${item.quote}`;
    if (!item?.quote || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMeaningfulFactValue(value) {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0 && value.some((item) => isMeaningfulFactValue(item));
  const text = String(value).trim();
  return text && !["未提及", "未明确", "未知", "无", "不适用"].includes(text);
}

function toList(value) {
  if (!isMeaningfulFactValue(value)) return [];
  if (Array.isArray(value)) return value.filter(isMeaningfulFactValue).map((item) => String(item).trim());
  return String(value)
    .split(/[、,，/]/)
    .map((item) => item.trim())
    .filter(isMeaningfulFactValue);
}

function normalizeIntentLevel(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "中高") return "中高意向";
  if (text === "高" || text === "低" || text === "中") return `${text}意向`;
  return text.includes("意向") ? text : `${text}意向`;
}

function mapExtractedSopActions(actions) {
  if (!actions || typeof actions !== "object") return {};
  const aliases = {
    greeted_customer: ["greeted_customer", "greeting", "greeting_and_inquiry", "问候开场"],
    asked_use_case: ["asked_use_case", "ask_usage", "询问用途", "询问用车场景"],
    asked_budget: ["asked_budget", "ask_budget", "询问预算"],
    asked_purchase_timeline: ["asked_purchase_timeline", "ask_timeline", "询问购车周期", "询问购买周期"],
    asked_decision_maker: ["asked_decision_maker", "ask_decision_maker", "询问决策人"],
    introduced_product_by_need: ["introduced_product_by_need", "product_explanation", "结合需求讲解"],
    invited_test_drive: ["invited_test_drive", "test_drive", "邀约试驾"],
    quoted_price: ["quoted_price", "quote", "报价"],
    handled_objection: ["handled_objection", "objection_response", "处理异议"],
    confirmed_next_followup: ["confirmed_next_followup", "confirm_followup", "确认下次跟进"]
  };
  if (Object.values(aliases).some((names) => names.some((name) => name in actions))) {
    return Object.fromEntries(
      Object.entries(aliases)
        .filter(([, names]) => names.some((name) => name in actions))
        .map(([key, names]) => [key, names.some((name) => actions[name] === true)])
    );
  }
  const internalKeys = [
    "greeted_customer",
    "asked_use_case",
    "asked_budget",
    "asked_purchase_timeline",
    "asked_decision_maker",
    "introduced_product_by_need",
    "invited_test_drive",
    "quoted_price",
    "handled_objection",
    "confirmed_next_followup"
  ];
  if (internalKeys.some((key) => key in actions)) {
    return Object.fromEntries(internalKeys.filter((key) => key in actions).map((key) => [key, Boolean(actions[key])]));
  }
  const knownChineseKeys = [
    "询问用途", "确认用途", "询问用车场景", "确认用车场景", "询问预算", "确认预算", "询问购车周期", "确认购车周期", "确认购买周期",
    "询问决策人", "确认决策人", "确认决策链", "结合需求讲解", "介绍产品", "确认关注点", "产品讲解", "邀约试驾", "试驾", "邀约体验",
    "报价", "解释价格", "报价议价", "处理异议", "异议处理", "确认下次跟进", "确认下一步", "离店闭环", "礼貌结束"
  ];
  if (!knownChineseKeys.some((key) => key in actions)) return {};
  const get = (...names) => names.some((name) => actions[name] === true);
  return {
    asked_use_case: get("询问用途", "确认用途", "询问用车场景", "确认用车场景"),
    asked_budget: get("询问预算", "确认预算"),
    asked_purchase_timeline: get("询问购车周期", "确认购车周期", "确认购买周期"),
    asked_decision_maker: get("询问决策人", "确认决策人", "确认决策链"),
    introduced_product_by_need: get("结合需求讲解", "介绍产品", "确认关注点", "产品讲解"),
    invited_test_drive: get("邀约试驾", "试驾", "邀约体验"),
    quoted_price: get("报价", "解释价格", "报价议价"),
    handled_objection: get("处理异议", "异议处理"),
    confirmed_next_followup: get("确认下次跟进", "确认下一步", "离店闭环", "礼貌结束")
  };
}

function inferConclusionFromFact(fact) {
  if (["高意向", "中高意向"].includes(fact.customerTags.intentLevel)) return "客户具备跟进价值，需围绕异议和下一步闭环推进";
  if (fact.customerTags.followUpValue === "高优先级") return "客户需要优先跟进";
  if ((fact.customerTags.objections || []).length) return "客户仍有异议待处理";
  return fact.conversation.conclusion || "本次接待已完成事实抽取";
}

function factValueForField(fieldName, fact) {
  const evidence = (pattern) => fact.evidence.filter((item) => pattern.test(`${item.type || ""} ${item.quote}`)).slice(0, 4);
  const fallbackEvidence = fact.evidence.slice(0, 2);
  const sop = fact.sopActions;
  const missingSop = Object.entries(sop)
    .filter(([, done]) => !done)
    .map(([key]) => key);
  const completedSop = Object.entries(sop)
    .filter(([, done]) => done)
    .map(([key]) => key);

  switch (fieldName) {
    case "场景事实":
      return { value: { scene_types: [fact.conversation.mainScene], products_discussed: [] }, evidence: fallbackEvidence };
    case "客户需求与约束":
      return { value: { use_case: fact.customerProfile.useCase, budget: fact.customerProfile.budgetValue, purchase_timeline: fact.customerProfile.purchaseTimeline, decision_expressions: fact.customerProfile.decisionMakers, concerns: fact.customerTags.concerns, competitors: fact.customerProfile.competitors }, evidence: evidence(/需求|用途|家用|通勤|预算|价格|周期|家人|关注|竞品/) };
    case "客户购买与阻塞信号":
      return { value: { purchase_signals: completedSop, blocking_signals: fact.customerObjections.map((item) => item.type), follow_up_signals: fact.followUpSignals || {} }, evidence: fallbackEvidence };
    case "客户异议事实":
      return { value: { objections: fact.customerObjections.map((item) => ({ type: item.type, expression: item.evidence?.quote || item.label, occurrence_count: item.signals?.occurrenceCount || 1, explicit_refusal: Boolean(item.signals?.explicitRefusal), blocked_actions: item.signals?.blockedActions || [] })) }, evidence: fact.customerObjections.map((item) => item.evidence).filter(Boolean) };
    case "销售需求挖掘行为":
      return { value: { sales_question_actions: fact.sopActions, customer_answers: [] }, evidence: evidence(/用途|预算|购买|周期|决策|关注|竞品/) };
    case "销售讲解与异议回应":
      return { value: { customer_requirements: fact.customerTags.concerns, sales_explanations: [], requirement_explanation_pairs: [], objection_responses: fact.customerObjections.map((item) => ({ objection_type: item.type, response_actions: item.responseActions || [], customer_reaction: item.customerReaction || "未提及" })), positive_behavior_candidates: fact.candidateScripts.slice(0, 3).map((item) => ({ behavior: item.reason, result: item.customerReaction })) }, evidence: evidence(/介绍|配置|功能|空间|安全|价格|异议|方案/) };
    case "销售推进与跟进约定":
      return { value: { completed_actions: completedSop.filter((key) => /test_drive|quoted|followup/.test(key)), follow_up_offer: fact.followUpFacts?.offer || "未提及", followup_time: fact.followUpFacts?.time || "未提及", channel: fact.followUpFacts?.channel || "未提及", customer_response: fact.followUpFacts?.customerAgreement || "未提及" }, evidence: evidence(/试驾|报价|优惠|联系|微信|电话|明天|复店/) };
    case "会话场景":
      return { value: { main_scene: fact.conversation.mainScene, sub_scene: fact.customerTags.purchaseStage }, evidence: fallbackEvidence };
    case "销售阶段":
      return { value: { sales_stage: fact.conversation.salesStage }, evidence: fallbackEvidence };
    case "用车/购买场景":
      return { value: { use_case: fact.customerProfile.useCase, explicit_or_inferred: fact.customerProfile.useCase === "未提及" ? "未提及" : "显性/强相关" }, evidence: evidence(/需求|空间|安全|用途|家用|通勤/) };
    case "预算信息":
      return { value: { budget_value: fact.customerProfile.budgetValue, price_sensitivity: fact.customerTags.priceSensitivity }, evidence: evidence(/价格|预算|贵|优惠|报价/) };
    case "购车/购买周期":
      return { value: { purchase_timeline: fact.customerProfile.purchaseTimeline, urgency_level: fact.customerTags.urgencyLevel }, evidence: evidence(/今天|近期|周末|月底|周期|时间/) };
    case "决策人/影响人":
      return { value: { decision_makers: fact.customerProfile.decisionMakers, decision_chain_status: fact.customerProfile.decisionChainStatus }, evidence: evidence(/决策|家人|老婆|老公|领导|商量/) };
    case "关注点":
      return { value: { concerns: fact.customerTags.concerns }, evidence: evidence(/需求|关注|空间|安全|价格|外观|动力|售后/) };
    case "竞品信息":
      return { value: { competitors: fact.customerProfile.competitors, comparison_dimension: fact.customerProfile.comparisonDimension }, evidence: evidence(/竞品|比亚迪|特斯拉|理想|问界|别家|其他店/) };
    case "显性异议":
      return { value: { explicit_objections: fact.customerObjections.map((item) => item.label), strength: fact.customerObjections.map((item) => ({ type: item.type, strength: item.strength })) }, evidence: fact.customerObjections.map((item) => item.evidence).filter(Boolean) };
    case "隐性异议":
      return { value: { implicit_objections: fact.customerObjections.length ? ["需人工结合上下文确认"] : ["无明确隐性异议"], inference_basis: "仅输出推断候选，不作为最终事实" }, evidence: fallbackEvidence };
    case "异议强度":
      return { value: { objection_strength: fact.customerObjections.map((item) => ({ type: item.type, strength: item.strength, handling: item.handling })) }, evidence: fact.customerObjections.map((item) => item.evidence).filter(Boolean) };
    case "意向等级":
      return { value: { intent_level: fact.customerTags.intentLevel, positive_signals: completedSop, negative_signals: fact.customerObjections.map((item) => item.type) }, evidence: fallbackEvidence };
    case "是否可跟进":
      return { value: { follow_up_value: fact.customerTags.followUpValue, reason: `${fact.customerTags.intentLevel}，异议：${fact.customerTags.objections.join("、") || "未明确"}` }, evidence: fallbackEvidence };
    case "SOP动作完成情况":
      return { value: { sop_actions: fact.sopActions }, evidence: fallbackEvidence };
    case "需求挖掘质量":
      return { value: { need_discovery_quality: fact.salesTags.needDiscovery, missing_items: missingSop }, evidence: fallbackEvidence };
    case "产品讲解匹配度":
      return { value: { product_explanation_match: fact.salesTags.productExplanation }, evidence: evidence(/需求|空间|安全|外观|动力|智能|配置/) };
    case "异议处理情况":
      return { value: { objection_handling: fact.customerObjections.map((item) => ({ type: item.type, handling: item.handling })) }, evidence: fact.customerObjections.map((item) => item.evidence).filter(Boolean) };
    case "成交推进动作":
      return { value: { closing_actions: completedSop.filter((key) => /test_drive|quoted|followup/.test(key)), missing_closing_actions: missingSop.filter((key) => /test_drive|quoted|followup/.test(key)) }, evidence: fallbackEvidence };
    case "跟进闭环":
      return { value: { follow_up_closure: fact.salesTags.followUpClosure, next_step_confirmed: fact.sopActions.confirmed_next_followup }, evidence: evidence(/跟进|联系|微信|电话|明天|复店/) };
    case "销售亮点":
      return { value: { sales_strengths: fact.candidateScripts.slice(0, 3).map((item) => item.reason) }, evidence: fact.candidateScripts.map((item) => item.evidence).filter(Boolean) };
    case "销售不足":
      return { value: { sales_weaknesses: missingSop }, evidence: fallbackEvidence };
    case "候选优秀话术":
      return { value: { candidate_scripts: fact.candidateScripts }, evidence: fact.candidateScripts.map((item) => item.evidence).filter(Boolean) };
    case "高风险片段":
      return { value: { risk_segments: fact.riskSegments }, evidence: fact.riskSegments };
    case "关键证据":
      return { value: { evidence: fact.evidence }, evidence: fact.evidence };
    default:
      return { value: "未配置映射", evidence: [] };
  }
}

function runDiagnosisRules(fact, diagnosisLayer) {
  const rules = Array.isArray(diagnosisLayer?.rules) ? diagnosisLayer.rules.filter((item) => item.enabled !== false) : [];
  const issues = [];
  const push = (rule, evidence, extra = {}) => {
    const needConfirmation = rule.ruleId === "need-discovery-insufficient" ? buildNeedConfirmationDiagnosis(fact) : null;
    issues.push({
      id: `diag_${issues.length + 1}`,
      issue: needConfirmation?.issue || rule.issue,
      category: rule.category || classifyIssue(rule.issue),
      riskLevel: rule.riskLevel || "中",
      reason: needConfirmation?.reason || rule.reason || "命中诊断规则",
      recoverable: rule.recoverable !== false,
      manualReviewRequired: Boolean(rule.manualReviewRequired),
      evidence: (needConfirmation?.evidence?.length ? needConfirmation.evidence : evidence)?.slice(0, 3) || [],
      ruleId: rule.ruleId || issueToRuleId(rule.issue),
      factBasis: needConfirmation ? {
        已明确: needConfirmation.known,
        部分明确: needConfirmation.partial,
        未明确: needConfirmation.missing,
        销售未确认: needConfirmation.unconfirmed
      } : undefined,
      ...extra
    });
  };

  for (const rule of rules) {
    const hit = matchDiagnosisRule(rule, fact);
    if (hit.matched) push(rule, hit.evidence, hit.extra);
  }
  if (!issues.length) {
    issues.push({
      id: "diag_1",
      issue: "本次接待暂无高风险问题",
      category: "综合诊断",
      riskLevel: "低",
      reason: "当前启用诊断规则未命中高风险问题",
      recoverable: false,
      manualReviewRequired: false,
      evidence: fact.evidence.slice(0, 2),
      ruleId: "no-high-risk"
    });
  }
  return issues;
}

function matchDiagnosisRule(rule, fact) {
  const sop = fact.sopActions;
  const sopFactCodes = {
    greeted_customer: "sales.greet_customer",
    asked_use_case: "sales.ask_use_case",
    asked_budget: "sales.ask_budget",
    asked_purchase_timeline: "sales.ask_purchase_timeline",
    asked_decision_maker: "sales.ask_decision_maker",
    introduced_product_by_need: "sales.explain_by_need",
    invited_test_drive: "sales.invite_test_drive",
    quoted_price: "sales.quote_price",
    handled_objection: "sales.handle_objection",
    confirmed_next_followup: "sales.confirm_followup"
  };
  const salesActionDone = (field) => {
    const row = factTableRow(fact, sopFactCodes[field]);
    return row ? row.status === "已执行" : Boolean(sop[field]);
  };
  const evidenceByType = {
    all: fact.evidence,
    asked_budget: fact.evidence.filter((e) => e.type === "价格/预算"),
    asked_purchase_timeline: fact.evidence.filter((e) => /时间|周期/.test(e.quote)),
    decision_chain_status: fact.evidence.filter((e) => e.type === "决策链"),
    价格: fact.evidence.filter((e) => e.type === "价格/预算"),
    竞品: fact.evidence.filter((e) => e.type === "竞品"),
    introduced_product_by_need: fact.evidence.filter((e) => e.type === "需求/关注点"),
    invited_test_drive: fact.evidence.filter((e) => e.type === "体验/试驾"),
    quoted_price: fact.evidence.filter((e) => e.type === "价格/预算"),
    confirmed_next_followup: fact.evidence.filter((e) => e.type === "跟进闭环"),
    intent_level: fact.evidence,
    risk_segments: fact.riskSegments
  };
  const evidence = evidenceByType[rule.evidenceSelector] || evidenceByType[rule.conditionField] || fact.evidence;
  switch (rule.conditionType) {
    case "missing_sop":
      return { matched: !salesActionDone(rule.conditionField), evidence };
    case "sop_count_lte": {
      const count = ["asked_use_case", "asked_budget", "asked_purchase_timeline", "asked_decision_maker"].filter(salesActionDone).length;
      return { matched: count <= 2, evidence: fact.evidence };
    }
    case "missing_sop_and_fact":
      if (rule.conditionField === "asked_budget") return { matched: !salesActionDone("asked_budget") && factTableRow(fact, "customer.budget")?.status === "未明确", evidence };
      if (rule.conditionField === "asked_purchase_timeline") return { matched: !salesActionDone("asked_purchase_timeline") && factTableRow(fact, "customer.purchase_timeline")?.status === "未明确", evidence };
      return { matched: !salesActionDone(rule.conditionField), evidence };
    case "decision_chain_open":
      return { matched: fact.customerProfile.decisionChainStatus === "决策链未闭合" && !sop.confirmed_next_followup, evidence };
    case "objection_unhandled":
      return { matched: fact.customerObjections.some((item) => item.type === rule.conditionField && item.handling !== "有效处理"), evidence };
    case "product_mismatch":
      return { matched: fact.derivedResults?.productExplanationMatch === "未发现对应讲解", evidence };
    case "missing_sop_when_intent":
      return { matched: !sop[rule.conditionField] && ["高意向", "中高意向", "中意向"].includes(fact.customerTags.intentLevel), evidence };
    case "quote_without_followup":
      return { matched: sop.quoted_price && !sop.confirmed_next_followup, evidence };
    case "high_intent_with_high_risk":
      return { matched: ["高意向", "中高意向"].includes(fact.customerTags.intentLevel) && inferHasHighRisk(fact), evidence, extra: { priority: "高" } };
    case "risk_segments_present":
      return { matched: fact.riskSegments.length > 0, evidence: fact.riskSegments, extra: { recoverable: false } };
    default:
      return { matched: false, evidence: [] };
  }
}

function inferHasHighRisk(fact) {
  return (
    fact.customerProfile.decisionChainStatus === "决策链未闭合" ||
    fact.customerObjections.some((item) => ["价格", "竞品"].includes(item.type) && item.handling !== "有效处理") ||
    !fact.sopActions.confirmed_next_followup ||
    fact.riskSegments.length > 0
  );
}

function matchStrategies(fact, diagnoses, strategyLayer) {
  const library = Array.isArray(strategyLayer?.strategies) ? strategyLayer.strategies.filter((item) => item.enabled !== false) : [];
  return diagnoses
    .map((diagnosis) => {
      const libraryItem = library
        .filter((item) => Array.isArray(item.triggerIssues) && item.triggerIssues.includes(diagnosis.issue))
        .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0))[0];
      if (libraryItem) {
        const nextBestAction = personalizeStrategyAction(fact, diagnosis, libraryItem.action, diagnoses);
        const presentation = buildStrategyPresentation(fact, diagnosis, libraryItem, nextBestAction, diagnoses);
        return {
          id: `strategy_${diagnosis.id}`,
          strategyId: libraryItem.strategyId,
          diagnosisId: diagnosis.id,
          issue: diagnosis.issue,
          nextBestAction,
          priority: diagnosis.riskLevel === "高" ? "高优先级" : diagnosis.riskLevel === "中高" ? "普通偏高" : "普通",
          timing: libraryItem.timing,
          channel: libraryItem.channel,
          materials: libraryItem.materials,
          templateKey: libraryItem.templateKey || libraryItem.strategyId,
          needManagerIntervention: Boolean(libraryItem.managerIntervention),
          evidenceToShow: diagnosis.evidence,
          strategyCategory: libraryItem.category,
          strategyPriority: libraryItem.priority,
          strategyTitle: presentation.title,
          strategyObjective: presentation.objective,
          actionSteps: presentation.actionSteps,
          strategySource: `策略库：${libraryItem.category}`
        };
      }
      return {
        id: `strategy_${diagnosis.id}`,
        strategyId: "pending_strategy_config",
        diagnosisId: diagnosis.id,
        issue: diagnosis.issue,
        nextBestAction: "该诊断问题暂未配置策略，请在策略库补充针对性动作。",
        priority: diagnosis.riskLevel === "高" ? "高优先级" : diagnosis.riskLevel === "中高" ? "普通偏高" : "普通",
        timing: "待配置",
        channel: "待配置",
        materials: [],
        templateKey: "pending_strategy_config",
        needManagerIntervention: diagnosis.riskLevel === "高",
        evidenceToShow: diagnosis.evidence,
        strategyCategory: "待配置",
        strategyTitle: "待补充销售行动策略",
        strategyObjective: `为“${diagnosis.issue}”补充可执行的销售动作`,
        actionSteps: ["请在策略库中配置执行动作、时机、渠道和所需材料。"],
        strategySource: "策略库：待配置"
      };
    })
    .sort((a, b) => {
      const pendingDiff = Number(a.strategyId === "pending_strategy_config") - Number(b.strategyId === "pending_strategy_config");
      if (pendingDiff) return pendingDiff;
      const riskWeight = { 高优先级: 3, 普通偏高: 2, 普通: 1 };
      return (riskWeight[b.priority] || 0) - (riskWeight[a.priority] || 0) || Number(b.strategyPriority || 0) - Number(a.strategyPriority || 0);
    })
    .slice(0, 6);
}

function buildStrategyPresentation(fact, diagnosis, libraryItem, nextBestAction, diagnoses = []) {
  const titleMap = {
    "greeting-repair": "首次跟进关系修复策略",
    "need-discovery-repair": "需求补全与车型匹配策略",
    "purchase-timeline-confirmation": "购车计划确认策略",
    "price-objection-followup": "价格异议推进策略",
    "test-drive-invite": "客户关注点试驾策略",
    "decision-maker-return": "关键决策人邀约策略",
    "competitor-compare": "竞品差异化沟通策略"
  };
  const objectiveMap = {
    "greeting-repair": "修复首次接待体验，建立后续沟通许可",
    "need-discovery-repair": "复用客户已表达的事实，只补齐销售尚未确认的信息，再匹配车型与方案",
    "purchase-timeline-confirmation": "确认客户用车时间和关键节点，锁定下一次推进安排",
    "price-objection-followup": "厘清预算差距，用落地价和金融方案推进客户决策",
    "test-drive-invite": "把客户关注点转化为可验证的试驾体验",
    "decision-maker-return": "让关键决策人参与沟通，闭合客户决策链",
    "competitor-compare": "围绕客户真实关注点建立可验证的产品差异"
  };
  if (libraryItem.strategyId === "need-discovery-repair") {
    const dimensions = [
      { label: "用途", status: factTableRow(fact, "customer.use_case")?.status },
      { label: "预算/价格范围", status: factTableRow(fact, "customer.budget")?.status },
      { label: "核心关注点", status: factTableRow(fact, "customer.concerns")?.status },
      { label: "决策人", status: factTableRow(fact, "customer.decision_maker")?.status },
      { label: "购车周期", status: factTableRow(fact, "customer.purchase_timeline")?.status }
    ];
    const known = dimensions.filter((item) => item.status === "已明确").map((item) => item.label);
    const partial = dimensions.filter((item) => item.status === "部分明确").map((item) => item.label);
    const missing = dimensions.filter((item) => item.status === "未明确").map((item) => item.label);
    const delegated = missing.filter((label) =>
      (label === "预算/价格范围" && diagnoses.some((item) => item.issue === "预算未确认")) ||
      (label === "购车周期" && diagnoses.some((item) => item.issue === "购车周期未确认"))
    );
    const remaining = missing.filter((label) => !delegated.includes(label));
    const actionSteps = [];
    if (known.length) actionSteps.push(`先复述确认客户已表达的${known.join("、")}，不重复从头询问。`);
    if (partial.length) actionSteps.push(`确认${partial.join("、")}的具体边界，不否定客户已有表达。`);
    if (remaining.length) actionSteps.push(`仅补问仍未明确的${remaining.join("、")}。`);
    if (delegated.length) actionSteps.push(`${delegated.join("、")}由对应专项策略单独推进，避免在本策略中重复询问。`);
    actionSteps.push("完成确认后，按用途、关注点和预算边界匹配车型、配置与方案。");
    return {
      title: titleMap[libraryItem.strategyId],
      objective: objectiveMap[libraryItem.strategyId],
      actionSteps
    };
  }
  const configuredSteps = String(nextBestAction || libraryItem.action || "")
    .split(/[；。]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `${item}。`);
  return {
    title: titleMap[libraryItem.strategyId] || `${libraryItem.category || "销售推进"}行动策略`,
    objective: objectiveMap[libraryItem.strategyId] || `针对“${diagnosis.issue}”形成可执行的销售动作`,
    actionSteps: configuredSteps.length ? configuredSteps : ["按策略库配置执行本次跟进动作。"]
  };
}

function personalizeStrategyAction(fact, diagnosis, configuredAction, diagnoses = []) {
  if (!["需求挖掘不足", "销售需求确认不足"].includes(diagnosis.issue)) return configuredAction;
  const dimensions = [
    { label: "用途", status: factTableRow(fact, "customer.use_case")?.status },
    { label: "预算", status: factTableRow(fact, "customer.budget")?.status },
    { label: "核心关注点", status: factTableRow(fact, "customer.concerns")?.status },
    { label: "决策人", status: factTableRow(fact, "customer.decision_maker")?.status },
    { label: "购车周期", status: factTableRow(fact, "customer.purchase_timeline")?.status }
  ];
  const known = dimensions.filter((item) => item.status === "已明确").map((item) => item.label);
  const partial = dimensions.filter((item) => item.status === "部分明确").map((item) => item.label);
  const missing = dimensions.filter((item) => item.status === "未明确").map((item) => item.label);
  const delegated = missing.filter((label) => (label === "预算" && diagnoses.some((item) => item.issue === "预算未确认")) || (label === "购车周期" && diagnoses.some((item) => item.issue === "购车周期未确认")));
  const remaining = missing.filter((label) => !delegated.includes(label));
  const knownText = [known.length ? `已明确${known.join("、")}` : "", partial.length ? `${partial.join("、")}已部分明确，仅需确认边界` : ""].filter(Boolean).join("；") || "当前事实层尚未形成明确需求信息";
  if (!missing.length) return `${knownText}；下次触达先复述确认客户需求，再直接匹配车型与方案。`;
  if (!remaining.length) return `${knownText}；其余缺口由${delegated.map((item) => `“${item}未确认”`).join("、")}专项策略处理，再匹配车型与方案。`;
  const delegatedText = delegated.length ? `；${delegated.join("、")}由专项策略处理` : "";
  return `${knownText}；下次触达仅确认${remaining.join("、")}${delegatedText}，再匹配车型与方案。`;
}

function buildAdvancedAnalysis(fact, diagnoses, strategies, config = {}) {
  const lossConfig = config?.lossAnalysis || {};
  const capabilityConfig = config?.salesCapability || {};
  const scriptConfig = config?.excellentScript || {};
  const enabledLossRules = (lossConfig.reasonRules || []).filter((item) => item.enabled !== false);
  const lossReasons = enabledLossRules.flatMap((rule) => {
    const keywords = Array.isArray(rule.diagnosisKeywords) ? rule.diagnosisKeywords : [];
    const hits = diagnoses.filter((diagnosis) => keywords.some((keyword) => `${diagnosis.issue} ${diagnosis.category}`.includes(keyword)));
    if (!hits.length) return [];
    return [{
      name: rule.name,
      sourceIssues: [...new Set(hits.map((item) => item.issue))],
      evidenceRequirement: rule.evidenceRequirement,
      evidence: hits.flatMap((item) => item.evidence || []).slice(0, 3)
    }];
  });

  const dimensions = (capabilityConfig.dimensions || []).filter((item) => item.enabled !== false).map((dimension) => {
    const keywords = Array.isArray(dimension.diagnosisKeywords) ? dimension.diagnosisKeywords : [];
    const issues = diagnoses.filter((diagnosis) => keywords.some((keyword) => `${diagnosis.issue} ${diagnosis.category}`.includes(keyword)));
    return {
      name: dimension.name,
      result: issues.length ? "本次短板" : "本次未发现短板",
      sourceIssues: issues.map((item) => item.issue),
      evidence: issues.flatMap((item) => item.evidence || []).slice(0, Number(capabilityConfig.evidenceSampleCount || 3))
    };
  });

  const scriptEvaluation = deriveExcellentScriptCandidates(fact, scriptConfig);
  const excellentScripts = scriptEvaluation.candidates;

  return {
    configSnapshot: {
      lossAnalysis: lossConfig.layerDescription,
      salesCapability: capabilityConfig.layerDescription,
      excellentScript: scriptConfig.layerDescription
    },
    lossAnalysis: {
      enabled: lossConfig.enabled !== false,
      status: lossReasons.length ? "候选原因待业务结果确认" : "当前证据不足",
      isConfirmedLoss: false,
      reasons: lossReasons,
      notice: "真实败单必须以客户反馈、CRM、POS或人工确认的业务结果为准。"
    },
    salesCapability: {
      enabled: capabilityConfig.enabled !== false,
      status: "本次接待能力表现",
      profileStatus: `累计至少${Number(capabilityConfig.minimumSessionCount || 10)}次接待后形成销售画像`,
      dimensions,
      excludedDimensions: capabilityConfig.excludedDimensions || []
    },
    excellentScript: {
      enabled: scriptConfig.enabled !== false,
      status: excellentScripts.length ? "候选话术待人工审核" : "暂无候选",
      autoPublish: false,
      candidates: excellentScripts,
      rejectedCount: scriptEvaluation.rejectedCount,
      ruleSummary: scriptEvaluation.ruleSummary,
      notice: "候选只复用事实层时序证据，必须形成“客户触发—销售回应—客户有效反应—状态跃迁”完整链路；经知识校验、人工审核和后续效果验证后才可进入话术库。"
    }
  };
}

function deriveExcellentScriptCandidates(fact, config = {}) {
  const window = config.globalWindow || {};
  const timeline = collectFactEvidenceTimeline(fact);
  const sceneGoals = (config.sceneGoals || []).filter((item) => item.enabled !== false);
  const behaviorStructures = (config.behaviorStructures || []).filter((item) => item.enabled !== false);
  const minimumReactionLevel = Number(window.minimumCustomerReactionLevel ?? 1);
  const maxCandidates = Number(window.maxCandidates || 3);
  const evaluated = [];

  timeline.forEach((entry, index) => {
    if (entry.role !== "销售") return;
    const triggerCandidates = timeline
      .slice(Math.max(0, index - Number(window.customerTriggerTurns || 3)), index)
      .filter((item) => item.role === "客户" && entry.seconds - item.seconds <= Number(window.customerTriggerSeconds || 60));
    const customerTrigger = triggerCandidates.at(-1);
    if (!customerTrigger) return;

    const salesResponses = timeline.slice(index, index + Number(window.salesResponseTurns || 5))
      .filter((item) => item.role === "销售" && item.seconds - entry.seconds <= Number(window.salesResponseSeconds || 120));
    const lastSalesSecond = salesResponses.at(-1)?.seconds ?? entry.seconds;
    const reaction = timeline.slice(index + 1)
      .filter((item) => item.role === "客户" && item.seconds >= lastSalesSecond && item.seconds - lastSalesSecond <= Number(window.customerReactionSeconds || 90))
      .slice(0, Number(window.customerReactionTurns || 3))[0];
    if (!reaction || reaction.seconds - customerTrigger.seconds > Number(window.maxEpisodeSeconds || 180)) return;

    const salesQuote = salesResponses.map((item) => item.quote).join("；");
    const episodeText = `${customerTrigger.quote} ${salesQuote} ${reaction.quote} ${entry.sourceField}`;
    const sceneGoal = resolveExcellentScriptScene(episodeText, sceneGoals);
    if (!sceneGoal) return;
    const structure = behaviorStructures.find((item) => item.scene === sceneGoal.name);
    const behaviorSteps = detectExcellentScriptBehaviorSteps(sceneGoal.name, salesQuote);
    const requiredSteps = Array.isArray(structure?.requiredSteps) ? structure.requiredSteps : [];
    const missingRequiredSteps = requiredSteps.filter((step) => !behaviorSteps.includes(step));
    const behaviorPassed = behaviorSteps.length >= Number(structure?.minimumSteps || 1) && !missingRequiredSteps.length;
    const reactionResult = classifyExcellentScriptReaction(reaction.quote, config.customerReactions || []);
    const transitionRule = (config.stateTransitions || []).find((item) => item.enabled !== false && item.scene === sceneGoal.name);
    const transitionPassed = Boolean(transitionRule) && reactionResult.level >= Number(transitionRule.minimumReactionLevel || 1);
    const eliminationReasons = evaluateExcellentScriptElimination({
      customerTrigger,
      salesResponses,
      reaction,
      salesQuote,
      scene: sceneGoal.name,
      behaviorSteps,
      behaviorPassed,
      transitionPassed
    });
    const knowledgeRequired = ["产品讲解", "价格金融", "竞品对比"].includes(sceneGoal.name);
    const eligible = behaviorPassed && reactionResult.level >= minimumReactionLevel && transitionPassed && !eliminationReasons.length;
    evaluated.push({
      scene: sceneGoal.name,
      sceneObjective: sceneGoal.objective,
      validResult: sceneGoal.validResult,
      customerContext: customerTrigger.quote,
      salesQuote,
      customerReaction: reaction.quote,
      customerReactionLevel: reactionResult.level,
      customerReactionName: reactionResult.name,
      behaviorSteps,
      missingRequiredSteps,
      stateTransition: transitionRule ? `${transitionRule.from} → ${transitionRule.to}` : "未配置状态跃迁",
      candidateLevel: reactionResult.level >= 4 ? "强候选" : "基础候选",
      knowledgeStatus: knowledgeRequired ? "待产品知识校验" : "不涉及关键产品知识",
      reason: `完成${behaviorSteps.join("、") || "有效回应"}，客户反应达到“${reactionResult.name}”，会话由“${transitionRule?.from || "原状态"}”推进到“${transitionRule?.to || "新状态"}”。`,
      evidence: dedupeEvidence([customerTrigger, ...salesResponses, reaction].map(({ timestamp, speaker, quote, type }) => ({ timestamp, speaker, quote, type }))),
      eliminationReasons,
      eligible,
      reviewStatus: "待店长/内训师审核"
    });
  });

  const seen = new Set();
  const candidates = evaluated
    .filter((item) => item.eligible)
    .filter((item) => {
      const key = `${item.scene}|${item.salesQuote}|${item.customerReaction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.customerReactionLevel - a.customerReactionLevel || b.behaviorSteps.length - a.behaviorSteps.length)
    .slice(0, maxCandidates)
    .map(({ eligible, eliminationReasons, ...item }) => item);

  return {
    candidates,
    rejectedCount: evaluated.filter((item) => !item.eligible).length,
    ruleSummary: {
      evidenceItems: timeline.length,
      evaluatedEpisodes: evaluated.length,
      requiredChain: "客户触发 → 销售回应 → 客户有效反应 → 会话状态跃迁",
      minimumCustomerReactionLevel: minimumReactionLevel
    }
  };
}

function collectFactEvidenceTimeline(fact) {
  const evidence = (fact.extractedFacts || []).flatMap((item) => normalizeFactEvidence(item.evidence).map((row) => ({
    ...row,
    sourceField: item.field || "事实字段",
    role: /销售|顾问/.test(row.speaker || "") ? "销售" : /客户|主客户/.test(row.speaker || "") ? "客户" : "待复核",
    seconds: parseExcellentScriptTimestamp(row.timestamp)
  })));
  const seen = new Set();
  return evidence
    .filter((item) => Number.isFinite(item.seconds) && item.role !== "待复核")
    .filter((item) => {
      const key = `${item.seconds}|${item.role}|${item.quote}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.seconds - b.seconds);
}

function parseExcellentScriptTimestamp(timestamp) {
  const match = String(timestamp || "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : Number.NaN;
}

function resolveExcellentScriptScene(text, goals) {
  const ranked = goals.map((goal) => ({
    goal,
    score: (goal.matchTerms || []).filter((term) => String(text).includes(term)).length
  })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].goal : null;
}

function classifyExcellentScriptReaction(text, configured) {
  const reactions = configured.length ? configured : [{ level: 0, name: "无效反应", examples: [] }];
  const negative = /不要|不行|不考虑|不需要|算了|投诉|别联系|没兴趣|太贵了不看/.test(text);
  if (negative) return { level: 0, name: "负向或终止反应" };
  const action = /试驾|帮我算|算一下|加微信|联系我|明天|周末|再来|复店|报价|留个电话/.test(text);
  const transaction = /订车|下订|定金|就定|锁车|准备资料|刷卡|签合同/.test(text);
  const softened = /可以考虑|这样的话|那还行|可以看看|能接受|也可以/.test(text);
  const understanding = /明白|懂了|具体|怎么算|还有|那为什么|那这个/.test(text) || /[？?]/.test(text);
  const disclosure = /主要是|预算|我比较|我在意|因为|平时|家用|通勤|孩子|家人/.test(text);
  const level = transaction ? 5 : action ? 4 : softened ? 3 : understanding ? 2 : disclosure ? 1 : 0;
  const matched = [...reactions].sort((a, b) => Number(b.level) - Number(a.level)).find((item) => Number(item.level) === level);
  return { level, name: matched?.name || (level ? `有效反应${level}级` : "无效反应") };
}

function detectExcellentScriptBehaviorSteps(scene, text) {
  const patterns = {
    "开放提问": /什么|哪些|怎么|如何|主要|平时|您更|您比较|有没有|是否|吗[？?]?/,
    "针对追问": /具体|刚才|除了|为什么|还有|您说的|那.*呢/,
    "复述确认": /也就是|您的意思|我理解|确认一下|所以您|也就是说/,
    "承接需求": /根据您|您刚才|您提到|针对您|结合您|像您这种|考虑到您/,
    "说明功能": /配置|功能|空间|安全|续航|座椅|底盘|智能|性能|支持/,
    "解释客户利益": /这样|可以让|好处|意味着|更适合|方便|省|满足|解决/,
    "确认理解": /您觉得|能接受|合适吗|可以吗|对吗|是否符合/,
    "关联关注点": /您关注|您在意|针对.*体验|试一下.*功能/,
    "设计体验项": /体验|感受|试试|重点看|重点体验/,
    "发出邀约": /试驾|试一下|体验一下|安排试车/,
    "确认时间": /几点|什么时候|今天|明天|周末|时间|约在/,
    "确认预算边界": /预算|首付|月供|价位|接受范围|落地价/,
    "拆解价格构成": /车价|保险|购置税|权益|落地|构成|包含/,
    "提供可选方案": /方案|可以选|一种是|另一种|或者|首付.*月供/,
    "确认接受程度": /能接受|合适吗|哪个方案|倾向|可以吗/,
    "接纳情绪": /理解|确实|您担心|您顾虑|换成我也/,
    "澄清原因": /您主要担心|具体是|是因为|您说的.*是指|哪一点/,
    "回应价值": /因为|所以|优势|价值|适合|能够|解决/,
    "提供证据或方案": /数据|测试|政策|方案|可以这样|实际|资料|对比表/,
    "确认异议变化": /这样能接受吗|还有顾虑吗|是否解决|您觉得呢|可以继续/,
    "确认比较维度": /您主要比|更看重|比较的是|哪方面|对比.*什么/,
    "引用客观事实": /参数|数据|官方|测试|版本|配置|续航|尺寸/,
    "解释差异": /区别|差异|相比|不同|多了|少了/,
    "回到客户适配": /对您|更适合您|结合您的|您的场景/,
    "确认选择倾向": /更倾向|您会选|更合适|考虑哪个/,
    "识别决策角色": /谁决定|和谁商量|家人|老婆|老公|父母|共同决定/,
    "确认关切": /他.*在意|她.*在意|家人.*关注|担心什么/,
    "提供共同决策材料": /资料|对比表|方案|发给|带回去|微信/,
    "约定共同沟通": /一起过来|共同试驾|电话沟通|约.*家人/,
    "确认购买条件": /合适就|如果.*就|满足.*可以|购买条件|什么时候定/,
    "给出推进选项": /可以先|下一步|锁车|下订|报价|准备/,
    "说明所需材料": /身份证|资料|材料|手续|银行卡|指标/,
    "确认下一动作": /我们就|您看.*可以吗|那就.*安排|确认.*下一步/,
    "回顾共识": /今天.*确认|刚才.*说到|目前您|总结一下|我们已经/,
    "明确动作": /我会|给您发|安排|联系|准备|预约/,
    "明确时间": /今天|明天|周末|小时内|点钟|日期|时间/,
    "明确渠道": /微信|电话|短信|到店|群里/,
    "客户确认": /您确认|可以吗|行吗|到时候|咱们就这么定/
  };
  const configuredSteps = {
    "需求挖掘": ["开放提问", "针对追问", "复述确认"],
    "产品讲解": ["承接需求", "说明功能", "解释客户利益", "确认理解"],
    "试驾推进": ["关联关注点", "设计体验项", "发出邀约", "确认时间"],
    "价格金融": ["确认预算边界", "拆解价格构成", "提供可选方案", "确认接受程度"],
    "异议处理": ["接纳情绪", "澄清原因", "回应价值", "提供证据或方案", "确认异议变化"],
    "竞品对比": ["确认比较维度", "引用客观事实", "解释差异", "回到客户适配", "确认选择倾向"],
    "家人决策": ["识别决策角色", "确认关切", "提供共同决策材料", "约定共同沟通"],
    "成交推进": ["确认购买条件", "给出推进选项", "说明所需材料", "确认下一动作"],
    "跟进闭环": ["回顾共识", "明确动作", "明确时间", "明确渠道", "客户确认"]
  };
  return (configuredSteps[scene] || []).filter((step) => patterns[step]?.test(text));
}

function evaluateExcellentScriptElimination(input) {
  const reasons = [];
  if (!input.customerTrigger || !input.salesResponses.length || !input.reaction) reasons.push("缺少完整互动链");
  if (!input.behaviorPassed) reasons.push("有效行为结构不完整");
  if (!input.transitionPassed) reasons.push("未形成可验证的会话状态跃迁");
  if (/保证|绝对|最低价|肯定通过|竞品.*不行|最便宜/.test(input.salesQuote)) reasons.push("不当承诺或贬低竞品");
  if (/不要|不行|不考虑|算了|投诉|别联系|没兴趣/.test(input.reaction?.quote || "")) reasons.push("客户反应倒退");
  if (input.scene === "价格金融" && /优惠|便宜|降价/.test(input.salesQuote) && !/价值|配置|方案|权益|落地|首付|月供/.test(input.salesQuote)) reasons.push("只靠降价推进");
  return reasons;
}

function normalizeRuleKeywords(value) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

function calculateCustomerLevel(fact, generationLayer = {}) {
  const rules = generationLayer.customerLevelRules || {};
  const levels = Array.isArray(rules.levels) ? rules.levels.filter((item) => item && item.level) : [];
  const customerEvidence = dedupeEvidence((fact.extractedFacts || [])
    .flatMap((item) => normalizeFactEvidence(item.evidence))
    .filter((item) => /客户/.test(String(item.speaker || ""))));
  const usedKeywords = new Set();
  const matches = [];
  let totalScore = 0;
  for (const levelRule of levels) {
    const point = Number(levelRule.score || 0);
    const excludedPhrases = normalizeRuleKeywords(levelRule.excludedPhrases);
    for (const keyword of normalizeRuleKeywords(levelRule.keywords)) {
      if (usedKeywords.has(keyword)) continue;
      const evidence = customerEvidence.find((item) => {
        const quote = String(item.quote || "");
        return quote.includes(keyword) && !excludedPhrases.some((phrase) => quote.includes(phrase));
      });
      if (!evidence) continue;
      usedKeywords.add(keyword);
      totalScore += point;
      matches.push({ keyword, score: point, sourceLevel: levelRule.level, evidence });
    }
  }
  const matchedLevel = [...levels]
    .sort((a, b) => Number(b.threshold || 0) - Number(a.threshold || 0))
    .find((item) => totalScore >= Number(item.threshold || 0));
  const level = matchedLevel?.level || "未达到一级";
  const alertConfig = rules.managerAlert || {};
  const managerIntervention = Boolean(alertConfig.enabled !== false && level === (alertConfig.triggerLevel || "三级"));
  return {
    enabled: rules.enabled !== false,
    level,
    name: matchedLevel?.name || "暂无有效客户意向关键词",
    description: matchedLevel?.description || "当前事实证据中未发现配置词库里的客户原话",
    totalScore,
    matches,
    evidence: dedupeEvidence(matches.map((item) => item.evidence)).slice(0, 8),
    managerIntervention,
    managerAlert: managerIntervention ? {
      required: true,
      channel: alertConfig.channel || "店长企业微信群机器人",
      recipientRole: alertConfig.recipientRole || "店长",
      webhookEnv: "MANAGER_WECHAT_WEBHOOK",
      status: process.env.MANAGER_WECHAT_WEBHOOK
        ? ((process.env.MANAGER_WECHAT_USER_IDS || process.env.MANAGER_WECHAT_MOBILES) ? "待发送" : "待填写店长企业微信用户ID或手机号")
        : "待配置企业微信机器人地址"
    } : { required: false, status: "未触发" }
  };
}

function renderGeneratedCards(fact, diagnoses, strategies, generationLayer, advancedConfig = {}) {
  const specs = generationLayer?.specs || {};
  const lossCandidate = diagnoses.find((item) => /价格|竞品|销售|闭环|决策/.test(item.issue));
  const configuredLossReason = fact.advancedAnalysis?.lossAnalysis?.reasons?.[0];
  const candidateScript = fact.advancedAnalysis?.excellentScript?.candidates?.[0];
  const customerLevel = calculateCustomerLevel(fact, generationLayer);
  const spec = (key, fallbackActions) => ({
    key,
    ...(specs[key] || {}),
    actions: specs[key]?.actions || fallbackActions
  });
  const cards = [
    {
      id: "card_customer_level",
      type: "客户意向等级",
      title: `${customerLevel.level}｜${customerLevel.name}`,
      status: customerLevel.managerIntervention ? "三级预警｜需店长介入" : "规则计算",
      content: customerLevel.matches.length
        ? `累计${customerLevel.totalScore}分。命中客户原话关键词：${customerLevel.matches.map((item) => `${item.keyword}（+${item.score}）`).join("、")}。${customerLevel.description}。`
        : "当前事实层客户原话证据未命中配置词库，不强制判定客户等级。",
      evidence: customerLevel.evidence,
      actions: customerLevel.managerIntervention
        ? spec("card_customer_level", ["确认等级", "调整等级", "店长已介入"]).actions
        : spec("card_customer_level", ["确认等级", "调整等级"]).actions.filter((item) => item !== "店长已介入"),
      managerIntervention: customerLevel.managerIntervention,
      managerAlert: customerLevel.managerAlert,
      scoreDetail: customerLevel.matches,
      generationSpec: spec("card_customer_level", ["确认等级", "调整等级", "店长已介入"])
    },
    {
      id: "card_loss",
      type: "败单分析卡片",
      title: configuredLossReason ? `候选原因：${configuredLossReason.name}` : "当前证据不足，不输出确定败单原因",
      status: "需结合CRM/人工确认",
      content: configuredLossReason
        ? `系统只输出候选败单原因。配置规则由诊断问题“${configuredLossReason.sourceIssues.join("、")}”命中，建议先看证据并结合真实业务结果确认。`
        : "没有CRM败单状态或明确流失证据时，不把模型判断写成真实败单原因。",
      evidence: configuredLossReason?.evidence || lossCandidate?.evidence || [],
      actions: spec("card_loss", ["认可", "修改原因", "标记可挽回", "标记不可挽回"]).actions,
      generationSpec: spec("card_loss", ["认可", "修改原因", "标记可挽回", "标记不可挽回"])
    },
    {
      id: "card_script",
      type: "优秀话术候选",
      title: candidateScript ? candidateScript.scene : "暂无候选优秀话术",
      status: candidateScript ? "待店长/内训师审核" : "无候选",
      content: candidateScript
        ? [
          `场景目标：${candidateScript.sceneObjective || candidateScript.scene}`,
          `客户触发：${candidateScript.customerContext}`,
          `销售有效行为：${(candidateScript.behaviorSteps || []).join("、") || "待复核"}`,
          `客户反应：${candidateScript.customerReactionName}｜${candidateScript.customerReaction}`,
          `状态跃迁：${candidateScript.stateTransition}`,
          `候选等级：${candidateScript.candidateLevel}；知识校验：${candidateScript.knowledgeStatus}`
        ].join("\n")
        : "本次事实包没有形成“客户触发—销售回应—客户有效反应—状态跃迁”的完整证据链，因此不生成候选。",
      evidence: candidateScript?.evidence || [],
      scriptDetail: candidateScript || null,
      actions: candidateScript ? spec("card_script", ["通过话术", "驳回话术", "优化后再审"]).actions : [],
      generationSpec: spec("card_script", ["通过话术", "驳回话术", "优化后再审"])
    },
    {
      id: "card_risk",
      type: "风险提醒",
      title: diagnoses.some((item) => item.riskLevel === "高") ? "存在高风险接待，建议人工复核" : "暂无高风险片段",
      status: "质检复核",
      content: "高风险扣分、败单归因、优秀话术入库默认需要人工确认，反馈会进入持续优化层。",
      evidence: fact.riskSegments,
      actions: spec("card_risk", ["确认风险", "驳回风险", "加入复核队列"]).actions,
      generationSpec: spec("card_risk", ["确认风险", "驳回风险", "加入复核队列"])
    },
    {
      id: "card_sales_capability",
      type: "销售能力诊断",
      title: fact.advancedAnalysis?.salesCapability?.dimensions?.some((item) => item.result === "本次短板") ? "本次接待存在能力短板" : "本次未发现明确能力短板",
      status: fact.advancedAnalysis?.salesCapability?.profileStatus || "样本积累中",
      content: (fact.advancedAnalysis?.salesCapability?.dimensions || [])
        .filter((item) => item.result === "本次短板")
        .map((item) => `${item.name}：${item.sourceIssues.join("、")}`)
        .join("；") || "本次启用规则未命中明确短板；完整销售画像需要汇总多次接待。",
      evidence: (fact.advancedAnalysis?.salesCapability?.dimensions || []).flatMap((item) => item.evidence || []).slice(0, 3),
      actions: spec("card_sales_capability", ["认可", "需复核", "加入陪练"]).actions,
      generationSpec: spec("card_sales_capability", ["认可", "需复核", "加入陪练"])
    }
  ];
  const enabledById = {
    card_customer_level: generationLayer?.customerLevelRules?.enabled !== false,
    card_loss: advancedConfig?.lossAnalysis?.enabled !== false,
    card_script: advancedConfig?.excellentScript?.enabled !== false,
    card_risk: true,
    card_sales_capability: advancedConfig?.salesCapability?.enabled !== false
  };
  return cards.filter((card) => enabledById[card.id] !== false);
}

function calculateScore(sop, diagnoses, scoring = {}) {
  const base = Number(scoring.baseScore ?? 100);
  const penalty =
    diagnoses.filter((item) => item.riskLevel === "高").length * Number(scoring.highPenalty ?? 8) +
    diagnoses.filter((item) => item.riskLevel === "中高").length * Number(scoring.mediumHighPenalty ?? 5) +
    diagnoses.filter((item) => item.riskLevel === "中").length * Number(scoring.mediumPenalty ?? 3) +
    diagnoses.filter((item) => item.riskLevel === "低").length * Number(scoring.lowPenalty ?? 0);
  return Math.max(0, Math.min(100, base - penalty));
}

function inferScene(text) {
  if (keywords.quote.test(text)) return "报价议价";
  if (keywords.testDrive.test(text)) return "试乘试驾";
  if (keywords.competitor.test(text)) return "竞品对比";
  if (keywords.follow.test(text)) return "离店跟进";
  if (keywords.needs.test(text)) return "需求挖掘";
  return "首次接待";
}

function inferSalesStage(text, sop, objections) {
  if (sop.quoted_price) return "价格比较";
  if (sop.invited_test_drive || /试驾/.test(text)) return "试驾体验";
  if (objections.some((item) => item.type === "家人决策")) return "决策犹豫";
  if (objections.length) return "产品比较";
  return "初步了解";
}

function inferPurchaseStage(text, objections) {
  if (keywords.quote.test(text)) return "价格比较";
  if (keywords.competitor.test(text)) return "配置比较";
  if (objections.some((item) => item.type === "家人决策")) return "决策期";
  return "初步了解";
}

function inferConversationConclusion(customerText, salesText) {
  if (/成交|下订|定了/.test(customerText + salesText)) return "客户表达购买意向";
  if (keywords.follow.test(salesText)) return "客户待跟进";
  if (/拒绝|不要|算了/.test(customerText)) return "客户明确拒绝";
  if (/考虑|再看看|商量/.test(customerText)) return "客户表示继续考虑";
  return "无明确结论";
}

function extractUseCase(text) {
  const hit = text.match(/家用|通勤|商务|接送孩子|老人乘坐|长途|自用|送人|企业采购/);
  return hit?.[0] || "未提及";
}

function extractBudget(text) {
  const hit = text.match(/(\d+(?:\.\d+)?)\s*(万|w|W|千|块|元|月供)/);
  if (hit) return `${hit[1]}${hit[2]}`;
  if (/预算|贵|便宜|优惠|月供|首付/.test(text)) return "价格敏感但未明确预算";
  return "未提及";
}

function extractTimeline(text) {
  const hit = text.match(/今天|本周|周末|月底|近期|一个月内|三个月内|不急|再看看/);
  return hit?.[0] || "未提及";
}

function extractDecisionMakers(text) {
  const makers = [];
  if (/老婆|妻子/.test(text)) makers.push("配偶/妻子");
  if (/老公|丈夫/.test(text)) makers.push("配偶/丈夫");
  if (/家人|父母|孩子/.test(text)) makers.push("家人");
  if (/领导|老板/.test(text)) makers.push("领导/老板");
  return makers.length ? makers : ["未提及"];
}

function extractComparisonDimension(text) {
  if (/价格|优惠|贵|便宜/.test(text)) return "价格/优惠";
  if (/配置|空间|安全|动力|续航|售后/.test(text)) return "产品配置/服务";
  return "未澄清";
}

function classifyIssue(issue) {
  if (/预算|价格|竞品|产品|试驾|报价|决策|客户/.test(issue)) return "客户推进";
  if (/需求|销售|闭环|讲解|异议/.test(issue)) return "销售执行";
  if (/合规|风险/.test(issue)) return "风险复核";
  return "综合诊断";
}

function issueToRuleId(issue) {
  return issue.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]+/gi, "-");
}

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
