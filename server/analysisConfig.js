import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configPath = join(__dirname, "config", "rules.json");

export function loadAnalysisConfig() {
  return normalizeAnalysisConfig(JSON.parse(readFileSync(configPath, "utf-8")));
}

export function saveAnalysisConfig(input) {
  const normalized = normalizeAnalysisConfig(input);
  validateAnalysisConfig(normalized);
  writeFileSync(configPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf-8");
  return loadAnalysisConfig();
}

export function saveAnalysisLayer(layerKey, layerConfig) {
  const current = loadAnalysisConfig();
  const allowed = new Set(["factLayer", "diagnosisLayer", "strategyLayer", "generationLayer", "feedbackLayer"]);
  if (!allowed.has(layerKey)) {
    throw new Error(`未知配置层：${layerKey}`);
  }
  current[layerKey] = layerConfig;
  return saveAnalysisConfig(current);
}

export function normalizeAnalysisConfig(input) {
  const base = input && typeof input === "object" && !Array.isArray(input) ? { ...input } : {};
  base.sop = Array.isArray(base.sop) ? base.sop : [];
  base.customerTags = base.customerTags && typeof base.customerTags === "object" ? base.customerTags : {};
  base.customerTags.intentLevel = uniqueEnum(base.customerTags.intentLevel, ["高意向", "中高意向", "中意向", "低意向", "无法判断"]);
  base.customerTags.followUpValue = uniqueEnum(base.customerTags.followUpValue, ["高优先级", "普通跟进", "低优先级", "不可跟进", "信息不足"]);
  base.salesTags = base.salesTags && typeof base.salesTags === "object" ? base.salesTags : {};
  base.complianceForbidden = Array.isArray(base.complianceForbidden) ? base.complianceForbidden : [];
  base.strategyTemplates = base.strategyTemplates && typeof base.strategyTemplates === "object" && !Array.isArray(base.strategyTemplates) ? base.strategyTemplates : {};
  base.feedbackOptions = base.feedbackOptions && typeof base.feedbackOptions === "object" ? base.feedbackOptions : {};
  base.factExtractionFields = sanitizeFactFields(Array.isArray(base.factExtractionFields) ? base.factExtractionFields : []);
  base.strategyLibrary = Array.isArray(base.strategyLibrary) ? base.strategyLibrary : [];
  base.generationSpecs = base.generationSpecs && typeof base.generationSpecs === "object" ? base.generationSpecs : {};

  base.factLayer = normalizeFactLayer(base.factLayer, base);
  base.diagnosisLayer = normalizeDiagnosisLayer(base.diagnosisLayer);
  base.customerInsightRules = normalizeCustomerInsightRules(base.customerInsightRules);
  base.strategyLayer = normalizeStrategyLayer(base.strategyLayer, base);
  base.generationLayer = normalizeGenerationLayer(base.generationLayer, base);
  base.feedbackLayer = normalizeFeedbackLayer(base.feedbackLayer, base);
  base.advancedCapabilities = normalizeAdvancedCapabilities(base.advancedCapabilities);
  base.semanticModel = normalizeSemanticModel(base.semanticModel);
  return base;
}

function normalizeSemanticModel(input) {
  const current = input && typeof input === "object" ? input : {};
  return {
    entities: Array.isArray(current.entities) && current.entities.length ? current.entities : [
      { name: "接待会话", description: "一次可独立分析的销售与客户对话。", enabled: true },
      { name: "原文片段", description: "带说话人和时间戳的可回溯对话证据。", enabled: true },
      { name: "客户", description: "当前接待中的主客户角色。", enabled: true },
      { name: "销售", description: "当前录音工牌绑定的销售角色。", enabled: true },
      { name: "车型", description: "对话中明确提及的车型或车系。", enabled: true },
      { name: "客户需求", description: "客户明确表达的用途、预算、关注点和购车条件。", enabled: true },
      { name: "客户异议", description: "客户明确表达的价格、竞品、产品、信任或决策顾虑。", enabled: true },
      { name: "销售动作", description: "销售在接待中实际完成的询问、讲解、邀约、报价和回应。", enabled: true },
      { name: "诊断问题", description: "诊断规则根据事实识别出的销售短板或风险。", enabled: true },
      { name: "策略", description: "针对诊断问题配置的下一步处理动作。", enabled: true },
      { name: "业务卡片", description: "生成层按规范形成的建议、分析或候选话术。", enabled: true }
    ],
    attributes: Array.isArray(current.attributes) && current.attributes.length ? current.attributes : [
      { entity: "原文片段", name: "说话人", dataType: "枚举", required: true, description: "该句话由销售、主客户或其他参与者说出。" },
      { entity: "原文片段", name: "时间戳", dataType: "时间", required: true, description: "该句话在录音中的开始位置。" },
      { entity: "客户需求", name: "需求类型", dataType: "枚举", required: true, description: "用途、预算、购买时间、决策人或核心关注点。" },
      { entity: "客户异议", name: "异议类型", dataType: "枚举", required: true, description: "价格、竞品、产品、信任、决策人、交付或售后。" },
      { entity: "销售动作", name: "动作类型", dataType: "枚举", required: true, description: "询问、讲解、邀约、报价、异议回应或跟进确认。" }
    ],
    relationships: Array.isArray(current.relationships) && current.relationships.length ? current.relationships : [
      { source: "接待会话", relation: "包含", target: "原文片段", description: "会话由按时间排序的原文片段构成。", enabled: true },
      { source: "客户", relation: "表达", target: "客户需求", description: "客户原话形成需求事实。", enabled: true },
      { source: "客户", relation: "提出", target: "客户异议", description: "客户原话形成异议事实。", enabled: true },
      { source: "销售", relation: "执行", target: "销售动作", description: "销售原话或行为形成动作事实。", enabled: true },
      { source: "诊断问题", relation: "依据", target: "客户需求", description: "诊断必须引用事实与证据。", enabled: true },
      { source: "诊断问题", relation: "匹配", target: "策略", description: "策略库按问题编码和适用条件匹配。", enabled: true },
      { source: "策略", relation: "生成", target: "业务卡片", description: "生成层按卡片规范组织策略内容。", enabled: true }
    ],
    enums: Array.isArray(current.enums) && current.enums.length ? current.enums : [
      { name: "说话人类型", values: "销售、主客户、其他参与者、无法判断", description: "用于统一角色分离结果。" },
      { name: "需求类型", values: "用途、预算、购买时间、决策人、核心关注点、竞品、已有车辆", description: "用于归一化客户需求事实。" },
      { name: "异议类型", values: "价格、竞品、产品不匹配、家人决策、信任、交付、售后", description: "用于归一化客户异议事实。" },
      { name: "风险等级", values: "低、中、高", description: "由诊断规则配置，不由大模型自由生成。" }
    ],
    synonyms: Array.isArray(current.synonyms) ? current.synonyms : [
      { canonical: "试驾", aliases: "体验、开一下、试一下", scope: "汽车行业" },
      { canonical: "报价", aliases: "落地价、算价、优惠、首付月供", scope: "汽车行业" },
      { canonical: "竞品", aliases: "对比车型、别的品牌、其他车", scope: "汽车行业" }
    ],
    brandExtensions: Array.isArray(current.brandExtensions) ? current.brandExtensions : []
  };
}

function uniqueEnum(current, defaults) {
  return [...new Set([...(Array.isArray(current) ? current : []), ...defaults])];
}

function validateAnalysisConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("配置必须是JSON对象。");
  }
  if (!Array.isArray(input.sop)) {
    throw new Error("配置缺少 sop 数组。");
  }
  if (!input.customerTags || typeof input.customerTags !== "object") {
    throw new Error("配置缺少 customerTags 对象。");
  }
  if (!input.salesTags || typeof input.salesTags !== "object") {
    throw new Error("配置缺少 salesTags 对象。");
  }
  if (!input.strategyTemplates || typeof input.strategyTemplates !== "object" || Array.isArray(input.strategyTemplates)) {
    throw new Error("配置缺少 strategyTemplates 对象。");
  }
  if (!input.feedbackOptions || typeof input.feedbackOptions !== "object") {
    throw new Error("配置缺少 feedbackOptions 对象。");
  }
  if (!input.factLayer || !Array.isArray(input.factLayer.fields)) {
    throw new Error("配置缺少 factLayer.fields。");
  }
  if (!input.diagnosisLayer || !Array.isArray(input.diagnosisLayer.rules)) {
    throw new Error("配置缺少 diagnosisLayer.rules。");
  }
  if (!input.strategyLayer || !Array.isArray(input.strategyLayer.strategies)) {
    throw new Error("配置缺少 strategyLayer.strategies。");
  }
  if (!input.generationLayer || !input.generationLayer.specs || typeof input.generationLayer.specs !== "object") {
    throw new Error("配置缺少 generationLayer.specs。");
  }
  if (!input.feedbackLayer || !Array.isArray(input.feedbackLayer.actors)) {
    throw new Error("配置缺少 feedbackLayer.actors。");
  }
  if (!input.advancedCapabilities || typeof input.advancedCapabilities !== "object") {
    throw new Error("配置缺少高级能力配置。");
  }
}

function normalizeAdvancedCapabilities(input) {
  const current = input && typeof input === "object" ? input : {};
  const loss = current.lossAnalysis && typeof current.lossAnalysis === "object" ? current.lossAnalysis : {};
  const capability = current.salesCapability && typeof current.salesCapability === "object" ? current.salesCapability : {};
  const script = current.excellentScript && typeof current.excellentScript === "object" ? current.excellentScript : {};
  return {
    lossAnalysis: {
      enabled: loss.enabled !== false,
      layerDescription: "诊断层识别候选原因，生成层组织败单分析，反馈层确认真实业务结果。",
      requireBusinessOutcome: loss.requireBusinessOutcome !== false,
      candidateOnlyWithoutOutcome: loss.candidateOnlyWithoutOutcome !== false,
      reviewerRoles: Array.isArray(loss.reviewerRoles) ? loss.reviewerRoles : ["店长", "运营"],
      reasonRules: Array.isArray(loss.reasonRules) && loss.reasonRules.length ? loss.reasonRules : defaultLossReasonRules()
    },
    salesCapability: {
      enabled: capability.enabled !== false,
      layerDescription: "诊断层将接待问题映射到能力维度，生成层输出本次表现；销售画像需汇总多次接待。",
      minimumSessionCount: Math.max(1, Number(capability.minimumSessionCount ?? 10)),
      evidenceSampleCount: Math.max(1, Number(capability.evidenceSampleCount ?? 3)),
      excludedDimensions: ["合规表现", "业务结果", "改进趋势"],
      dimensions: Array.isArray(capability.dimensions) && capability.dimensions.length ? capability.dimensions : defaultCapabilityDimensions()
    },
    excellentScript: {
      enabled: script.enabled !== false,
      layerDescription: "事实层保留客户触发、销售回应、客户反应和时序证据；规则引擎识别会话状态跃迁，审核与业务结果验证后才可入库。",
      autoPublish: false,
      globalWindow: normalizeScriptWindow(script.globalWindow),
      sceneGoals: Array.isArray(script.sceneGoals) && script.sceneGoals.length ? script.sceneGoals : defaultScriptSceneGoals(),
      behaviorStructures: Array.isArray(script.behaviorStructures) && script.behaviorStructures.length ? script.behaviorStructures : defaultScriptBehaviorStructures(),
      customerReactions: Array.isArray(script.customerReactions) && script.customerReactions.length ? script.customerReactions : defaultScriptCustomerReactions(),
      stateTransitions: Array.isArray(script.stateTransitions) && script.stateTransitions.length ? script.stateTransitions : defaultScriptStateTransitions(),
      eliminationRules: Array.isArray(script.eliminationRules) && script.eliminationRules.length ? script.eliminationRules : defaultScriptEliminationRules(),
      knowledgeRequirements: Array.isArray(script.knowledgeRequirements) && script.knowledgeRequirements.length ? script.knowledgeRequirements : defaultScriptKnowledgeRequirements(),
      reviewRules: normalizeScriptReviewRules(script.reviewRules),
      outcomeValidation: normalizeScriptOutcomeValidation(script.outcomeValidation)
    }
  };
}

function normalizeScriptWindow(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    customerTriggerTurns: Math.max(1, Number(value.customerTriggerTurns ?? 3)),
    customerTriggerSeconds: Math.max(10, Number(value.customerTriggerSeconds ?? 60)),
    salesResponseTurns: Math.max(1, Number(value.salesResponseTurns ?? 5)),
    salesResponseSeconds: Math.max(10, Number(value.salesResponseSeconds ?? 120)),
    customerReactionTurns: Math.max(1, Number(value.customerReactionTurns ?? 3)),
    customerReactionSeconds: Math.max(10, Number(value.customerReactionSeconds ?? 90)),
    maxEpisodeSeconds: Math.max(30, Number(value.maxEpisodeSeconds ?? 180)),
    maxCandidates: Math.max(1, Number(value.maxCandidates ?? 3)),
    minimumCustomerReactionLevel: Math.max(0, Number(value.minimumCustomerReactionLevel ?? 1))
  };
}

function defaultScriptSceneGoals() {
  return [
    { enabled: true, name: "需求挖掘", objective: "帮助客户明确用途、预算、周期、决策人或核心关注点。", validResult: "客户新增披露至少两项需求信息，且销售完成一次复述确认。", matchTerms: ["用途", "预算", "周期", "决策人", "关注点", "需求"] },
    { enabled: true, name: "产品讲解", objective: "把客户需求与车型功能、利益和适用场景建立对应关系。", validResult: "客户确认相关性、继续追问具体功能，或愿意进入体验环节。", matchTerms: ["功能", "配置", "空间", "安全", "续航", "座椅", "产品"] },
    { enabled: true, name: "试驾推进", objective: "把客户关注点转化为可验证的试驾体验任务。", validResult: "客户同意试驾或明确可执行的试驾时间。", matchTerms: ["试驾", "体验", "试车"] },
    { enabled: true, name: "价格金融", objective: "确认预算边界并提供客户能理解的价格、首付、月供或权益方案。", validResult: "客户接受算价、继续讨论付款方案或确认报价边界。", matchTerms: ["价格", "预算", "优惠", "首付", "月供", "金融", "权益"] },
    { enabled: true, name: "异议处理", objective: "澄清异议原因，提供证据或替代方案，并确认异议是否下降。", validResult: "客户异议软化、接受替代方案或愿意继续推进。", matchTerms: ["异议", "顾虑", "担心", "不方便", "不合适", "没有"] },
    { enabled: true, name: "竞品对比", objective: "按客户关注的客观维度比较差异并回到客户适配性。", validResult: "客户愿意重新比较、继续体验或追问差异。", matchTerms: ["竞品", "对比", "别家", "零跑", "理想", "问界"] },
    { enabled: true, name: "家人决策", objective: "识别共同决策链并促成家人共同体验或材料共享。", validResult: "客户同意与家人沟通、共同到店或接收决策材料。", matchTerms: ["家人", "老婆", "老公", "父母", "商量", "决策"] },
    { enabled: true, name: "成交推进", objective: "推动报价、锁车、订车、资料准备或成交确认。", validResult: "客户同意报价、准备资料、锁车或订车。", matchTerms: ["报价", "锁车", "订车", "下订", "成交", "资料"] },
    { enabled: true, name: "跟进闭环", objective: "把后续动作、时间、渠道和双方责任明确下来。", validResult: "客户明确接受下一步动作和时间安排。", matchTerms: ["跟进", "联系", "微信", "电话", "复店", "明天", "时间"] }
  ];
}

function defaultScriptBehaviorStructures() {
  return [
    { enabled: true, scene: "需求挖掘", steps: ["开放提问", "针对追问", "复述确认"], minimumSteps: 2, requiredSteps: ["复述确认"] },
    { enabled: true, scene: "产品讲解", steps: ["承接需求", "说明功能", "解释客户利益", "确认理解"], minimumSteps: 3, requiredSteps: ["承接需求"] },
    { enabled: true, scene: "试驾推进", steps: ["关联关注点", "设计体验项", "发出邀约", "确认时间"], minimumSteps: 3, requiredSteps: ["发出邀约"] },
    { enabled: true, scene: "价格金融", steps: ["确认预算边界", "拆解价格构成", "提供可选方案", "确认接受程度"], minimumSteps: 3, requiredSteps: ["确认预算边界"] },
    { enabled: true, scene: "异议处理", steps: ["接纳情绪", "澄清原因", "回应价值", "提供证据或方案", "确认异议变化"], minimumSteps: 3, requiredSteps: ["澄清原因", "确认异议变化"] },
    { enabled: true, scene: "竞品对比", steps: ["确认比较维度", "引用客观事实", "解释差异", "回到客户适配", "确认选择倾向"], minimumSteps: 3, requiredSteps: ["确认比较维度"] },
    { enabled: true, scene: "家人决策", steps: ["识别决策角色", "确认关切", "提供共同决策材料", "约定共同沟通"], minimumSteps: 3, requiredSteps: ["识别决策角色"] },
    { enabled: true, scene: "成交推进", steps: ["确认购买条件", "给出推进选项", "说明所需材料", "确认下一动作"], minimumSteps: 3, requiredSteps: ["确认下一动作"] },
    { enabled: true, scene: "跟进闭环", steps: ["回顾共识", "明确动作", "明确时间", "明确渠道", "客户确认"], minimumSteps: 4, requiredSteps: ["明确动作", "明确时间", "客户确认"] }
  ];
}

function defaultScriptCustomerReactions() {
  return [
    { level: 0, name: "无效反应", meaning: "仅有嗯、好、知道了等弱回应，或没有客户后续反应。", examples: ["嗯", "好", "知道了", "再说吧"] },
    { level: 1, name: "新增信息披露", meaning: "客户补充用途、预算、关注点、周期、决策人或异议原因。", examples: ["主要是", "预算", "我比较在意", "因为"] },
    { level: 2, name: "理解与追问", meaning: "客户确认理解并继续追问产品、价格或方案细节。", examples: ["明白", "那", "具体", "怎么算", "还有"] },
    { level: 3, name: "异议软化", meaning: "客户由明确反对转为可考虑、接受替代方案或愿意继续比较。", examples: ["可以考虑", "这样的话", "那还行", "可以看看"] },
    { level: 4, name: "行动接受", meaning: "客户同意试驾、算价、留资、复店或明确跟进时间。", examples: ["可以试驾", "帮我算", "加微信", "明天联系", "再来看看"] },
    { level: 5, name: "交易推进", meaning: "客户确认锁车、下订、准备资料或支付安排。", examples: ["订车", "就定", "准备资料", "付定金"] }
  ];
}

function defaultScriptStateTransitions() {
  return [
    { enabled: true, scene: "需求挖掘", from: "需求未知或模糊", to: "需求新增明确", minimumReactionLevel: 1 },
    { enabled: true, scene: "产品讲解", from: "产品价值不明确", to: "理解与自身需求的关系", minimumReactionLevel: 2 },
    { enabled: true, scene: "试驾推进", from: "未形成体验动作", to: "愿意试驾或已预约", minimumReactionLevel: 4 },
    { enabled: true, scene: "价格金融", from: "购车成本不明确", to: "接受算价或付款方案讨论", minimumReactionLevel: 2 },
    { enabled: true, scene: "异议处理", from: "异议阻碍推进", to: "异议软化或接受替代方案", minimumReactionLevel: 3 },
    { enabled: true, scene: "竞品对比", from: "偏向竞品或差异不明", to: "愿意重新比较或体验", minimumReactionLevel: 3 },
    { enabled: true, scene: "家人决策", from: "决策链未闭合", to: "同意共同沟通或共同到店", minimumReactionLevel: 4 },
    { enabled: true, scene: "成交推进", from: "尚未进入交易动作", to: "报价、锁车、下订或资料准备", minimumReactionLevel: 4 },
    { enabled: true, scene: "跟进闭环", from: "后续动作不明确", to: "动作、时间和渠道已约定", minimumReactionLevel: 4 }
  ];
}

function defaultScriptEliminationRules() {
  return [
    { enabled: true, name: "缺少完整互动链", description: "没有形成客户触发、销售回应、客户后续反应三段证据。" },
    { enabled: true, name: "角色未确认", description: "关键证据仍是说话人编号或角色待复核。" },
    { enabled: true, name: "泛化讲解", description: "销售连续讲产品但没有承接客户需求或异议。" },
    { enabled: true, name: "长时间单向输出", description: "销售连续讲解超过90秒且客户没有有效互动。", threshold: 90 },
    { enabled: true, name: "客户反应倒退", description: "客户在后续反应中明确拒绝、反感、投诉或终止沟通。" },
    { enabled: true, name: "不当承诺或贬低竞品", description: "包含绝对承诺、最低价保证、贷款必过或贬低竞品表达。" },
    { enabled: true, name: "只靠降价推进", description: "没有价值说明，仅通过优惠或降价换取客户反应。" },
    { enabled: true, name: "销售未创造增量", description: "客户已主动提出下一步，销售没有增加确认、方案或行动安排。" },
    { enabled: true, name: "知识冲突", description: "车型、价格、权益、金融、库存或交付信息与有效知识版本冲突。" }
  ];
}

function defaultScriptKnowledgeRequirements() {
  return [
    { enabled: true, category: "车型与配置", requirement: "车型、版本、年款和功能必须匹配当前品牌知识库。", tolerance: "不允许核心参数错误" },
    { enabled: true, category: "价格与权益", requirement: "必须绑定适用区域、门店和有效日期。", tolerance: "过期或跨区域政策不得入库" },
    { enabled: true, category: "金融方案", requirement: "首付、月供、期限和利率计算可复核。", tolerance: "计算误差不超过1%" },
    { enabled: true, category: "库存与交付", requirement: "只能引用当前库存和交付数据，不得作确定性承诺。", tolerance: "必须标注数据时间" },
    { enabled: true, category: "售后政策", requirement: "质保、保养和服务权益必须引用当前政策。", tolerance: "不允许扩大承诺" },
    { enabled: true, category: "竞品信息", requirement: "比较维度和数据必须有可追溯来源。", tolerance: "禁止贬低或无法验证的比较" }
  ];
}

function normalizeScriptReviewRules(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    reviewerRoles: Array.isArray(value.reviewerRoles) ? value.reviewerRoles : ["店长", "内训师"],
    reviewActions: Array.isArray(value.reviewActions) ? value.reviewActions : ["审核通过", "驳回", "修改后入库"],
    deadlineHours: Math.max(1, Number(value.deadlineHours ?? 48)),
    officialMinimumApprovals: Math.max(1, Number(value.officialMinimumApprovals ?? 2)),
    maxEdits: Math.max(0, Number(value.maxEdits ?? 2)),
    productExpertOnKnowledgeConflict: value.productExpertOnKnowledgeConflict !== false
  };
}

function normalizeScriptOutcomeValidation(input) {
  const value = input && typeof input === "object" ? input : {};
  return {
    testDriveDays: Math.max(1, Number(value.testDriveDays ?? 7)),
    revisitDays: Math.max(1, Number(value.revisitDays ?? 14)),
    quoteDays: Math.max(1, Number(value.quoteDays ?? 14)),
    orderDays: Math.max(1, Number(value.orderDays ?? 30)),
    dealOrLossDays: Math.max(1, Number(value.dealOrLossDays ?? 60)),
    storeValidatedUses: Math.max(1, Number(value.storeValidatedUses ?? 10)),
    storeValidatedSalespeople: Math.max(1, Number(value.storeValidatedSalespeople ?? 3)),
    benchmarkUses: Math.max(1, Number(value.benchmarkUses ?? 30)),
    benchmarkSalespeople: Math.max(1, Number(value.benchmarkSalespeople ?? 5)),
    baselineLiftPoints: Math.max(0, Number(value.baselineLiftPoints ?? 5)),
    downgradeNegativeReactionRate: Math.max(0, Number(value.downgradeNegativeReactionRate ?? 15))
  };
}

function defaultLossReasonRules() {
  return [
    { enabled: true, name: "价格价值未达成一致", diagnosisKeywords: ["价格", "报价"], evidenceRequirement: "引用客户价格异议、销售回应和后续推进证据。" },
    { enabled: true, name: "竞品比较未有效回应", diagnosisKeywords: ["竞品"], evidenceRequirement: "引用客户竞品表达和销售差异化回应证据。" },
    { enabled: true, name: "决策链未闭合", diagnosisKeywords: ["决策链", "家人"], evidenceRequirement: "引用决策人表达和是否安排共同体验或复店。" },
    { enabled: true, name: "体验或试驾推进不足", diagnosisKeywords: ["试驾", "体验"], evidenceRequirement: "引用客户体验意愿和销售邀约安排。" },
    { enabled: true, name: "离店后续动作未闭环", diagnosisKeywords: ["跟进", "闭环", "推进不足"], evidenceRequirement: "引用下一步动作、时间、渠道和客户是否同意。" }
  ];
}

function defaultCapabilityDimensions() {
  return [
    { enabled: true, name: "需求挖掘", diagnosisKeywords: ["需求挖掘", "预算", "购车周期", "决策人"] },
    { enabled: true, name: "产品讲解匹配", diagnosisKeywords: ["产品讲解", "客户需求"] },
    { enabled: true, name: "异议识别", diagnosisKeywords: ["异议"] },
    { enabled: true, name: "异议处理", diagnosisKeywords: ["价格异议", "竞品异议", "决策链"] },
    { enabled: true, name: "试驾推进", diagnosisKeywords: ["试驾", "体验推进"] },
    { enabled: true, name: "报价议价", diagnosisKeywords: ["报价", "价格"] },
    { enabled: true, name: "成交推进", diagnosisKeywords: ["成交", "推进不足", "流失风险"] },
    { enabled: true, name: "跟进闭环", diagnosisKeywords: ["跟进", "闭环"] },
    { enabled: true, name: "倾听追问", diagnosisKeywords: ["倾听", "追问", "打断"] },
    { enabled: true, name: "沟通表达", diagnosisKeywords: ["回应机械", "表达", "服务态度"] }
  ];
}

function normalizeFactLayer(layer, base) {
  const current = layer && typeof layer === "object" ? layer : {};
  const model = current.model && typeof current.model === "object" ? current.model : {};
  const configuredFields = sanitizeFactFields(Array.isArray(current.fields) ? current.fields : base.factExtractionFields);
  const migratingLegacyFields = current.fieldDesignVersion !== "role-behavior-v4" || shouldMigrateLegacyFactFields(configuredFields);
  const fields = migratingLegacyFields ? defaultAtomicFactFields() : configuredFields;
  const defaultSystemPrompt = "你是汽车销售会话事实抽取助手。基于已经区分为销售和客户的ASR转写文本，只抽取场景事实、客户明确表达和销售实际行为；不得评分、诊断、推测、总结优劣或生成跟进策略。严格区分客户表达与销售行为，不把销售介绍当作客户需求。每项事实必须带说话人、时间戳和原文；无证据输出未提及；相反信息全部保留并标记信息冲突；禁止输出置信度。";
  const defaultUserPrompt = "请基于以下已修正ASR文本，一次性抽取配置中的7类事实。只记录对话中已经发生的场景、客户行为和销售行为；不得输出销售阶段、参与角色、执行人、质量等级、异议强弱、是否可跟进、意向等级或推荐的下一步动作。所有内容必须回溯到当前接待原文。\n\n{{转写文本}}";
  const configuredUserPrompt = String(migratingLegacyFields ? defaultUserPrompt : current.userPromptTemplate || defaultUserPrompt)
    .replace(/\\n/g, "\n")
    .replace(/\{\{\s*transcript\s*\}\}/gi, "{{转写文本}}");
  const userPromptTemplate = /\{\{\s*转写文本\s*\}\}/.test(configuredUserPrompt)
    ? configuredUserPrompt
    : `${configuredUserPrompt}\n\n{{转写文本}}`;
  return {
    enabled: current.enabled !== false,
    industry: current.industry || "汽车销售",
    schemaSource: migratingLegacyFields ? "汽车行业通用角色行为事实（7类）" : current.schemaSource || "汽车行业通用角色行为事实（7类）",
    fieldDesignVersion: "role-behavior-v4",
    model: {
      enabled: model.enabled !== false,
      provider: model.provider || "poc-local",
      displayName: model.displayName || "POC内置事实抽取器",
      baseUrlEnv: model.baseUrlEnv || "LLM_BASE_URL",
      apiKeyEnv: model.apiKeyEnv || "LLM_API_KEY",
      modelEnv: model.modelEnv || "LLM_MODEL",
      temperature: Number(model.temperature ?? 0),
      topP: Number(model.topP ?? 0.8),
      maxCompletionTokens: Number(model.maxCompletionTokens ?? 12000),
      enableThinking: Boolean(model.enableThinking),
      allowLocalExtractor: model.allowLocalExtractor !== false
    },
    systemPrompt:
      migratingLegacyFields ? defaultSystemPrompt : current.systemPrompt || defaultSystemPrompt,
    userPromptTemplate,
    outputRules: Array.isArray(current.outputRules)
      ? current.outputRules.filter((item) => !/置信|confidence/i.test(String(item)))
      : ["一次请求抽取全部启用字段", "只输出场景、客户行为和销售行为", "不得输出销售阶段、参与角色或执行人", "不得直接输出质量、强度、意向或跟进等级", "不得生成下一步动作", "证据必须来自当前接待原文"],
    fields
  };
}

function shouldMigrateLegacyFactFields(fields) {
  const required = new Set(["场景事实", "客户需求与约束", "客户购买与阻塞信号", "客户异议事实", "销售需求挖掘行为", "销售讲解与异议回应", "销售推进与跟进约定"]);
  return fields.length !== required.size || fields.some((item) => !required.has(item.field));
}

function defaultAtomicFactFields() {
  const field = (key, category, meaning, modelPrompt, outputRequirement, allowedValues = "") => ({
    key,
    category,
    field: key,
    meaning,
    modelPrompt,
    outputRequirement,
    allowedValues,
    enabled: true,
    requiresEvidence: true
  });
  return [
    field("场景事实", "场景事实", "抽取本次对话涉及的业务场景和产品对象，不判断销售阶段。", "提取本次对话中明确发生的业务场景，例如看车咨询、需求沟通、产品介绍、试驾沟通、报价沟通、竞品比较、金融或置换沟通、离店前沟通；同时记录明确提及的车型、版本或方案。不输出销售阶段和参与角色。", "场景类型、讨论的产品", "场景类型：看车咨询、需求沟通、产品介绍、试驾沟通、报价沟通、竞品比较、金融沟通、置换沟通、交付咨询、离店前沟通、其他明确场景"),
    field("客户需求与约束", "客户行为事实", "抽取客户明确表达的需求、条件和限制。", "只从客户原话提取使用场景、预算或价格范围、购买时间、决策相关表达、核心关注点、竞品或已有车辆。销售单方面介绍不能作为客户需求；未提及就留空。", "使用场景、预算、购买时间、决策表达、关注点、竞品"),
    field("客户购买与阻塞信号", "客户行为事实", "抽取客户的购买倾向、沟通许可和阻塞信号，等级由规则层计算。", "只从客户原话提取试驾意愿、询价、优惠、金融、置换、现车、交付、留资、到店、订金或下单等购买信号，以及明确拒绝、停止联系、无购买需求和其他阻塞信号。不得输出意向等级或是否可跟进。", "购买信号、阻塞信号、跟进许可信号", "购买信号类型：试驾意愿、询价、优惠咨询、金融咨询、置换咨询、现车咨询、交付咨询、留资、到店、订金、下单；阻塞信号类型：明确拒绝、停止联系、暂无购买需求、暂缓购买、其他明确阻塞"),
    field("客户异议事实", "客户行为事实", "抽取客户异议及其客观表现，强度由规则层计算。", "提取客户表达的价格、产品、竞品、信任、决策、交付、售后等异议，记录异议类型、原话、出现次数、是否明确拒绝及阻碍的推进动作。不输出异议强弱。", "异议类型、原话、出现次数、明确拒绝、阻碍动作", "异议类型：价格、产品、竞品、信任、决策、交付、售后、其他"),
    field("销售需求挖掘行为", "销售行为事实", "抽取销售实际完成的需求询问和确认行为。", "提取销售是否主动询问或复述确认客户的使用场景、预算、购买时间、决策相关表达、核心关注点、竞品或已有车辆；记录客户是否明确回答。只记录已发生行为，不判断挖掘质量或输出缺失项。", "销售询问动作、客户回答", "询问主题：使用场景、预算、购买时间、决策相关、核心关注点、竞品、已有车辆"),
    field("销售讲解与异议回应", "销售行为事实", "抽取销售讲解、需求对应关系和异议回应行为。", "提取销售实际介绍的车型、版本、功能、卖点或方案；记录其与客户需求、关注点或异议的对应关系，并提取销售对异议的追问、解释、价值回应、证据、替代方案以及客户反应。不判断讲解是否优秀或异议处理是否合格。", "客户需求、销售讲解、需求讲解对应关系、异议回应、正向行为候选", "回应动作：追问原因、解释说明、价值回应、提供证据、替代方案、后续测算；客户反应：接受、部分接受、继续质疑、拒绝、未明确"),
    field("销售推进与跟进约定", "销售行为事实", "抽取销售已经实施的成交推进，以及录音中已经提出并得到回应的跟进约定。", "提取销售实际完成的试驾邀约、报价结果、金融方案、置换评估、申请优惠、店长介入、留资、订金、下单和复店邀约。若销售在录音中明确提出后续联系，只记录跟进提议、明确时间、联系渠道和客户回应；不输出执行人、跟进目标、推荐的下一步动作或是否闭环。", "已完成推进动作、跟进提议、跟进时间、联系渠道、客户回应", "推进动作：试驾邀约、报价、金融方案、置换评估、优惠申请、店长介入、留资、订金、下单、复店邀约；联系渠道：电话、微信、短信、到店、其他明确渠道")
  ];
}

function sanitizeFactFields(fields) {
  return fields.map((field, index) => ({
    key: field.key || field.field || `fact_${index + 1}`,
    category: field.category || "未分组",
    field: field.field || field.key || `字段${index + 1}`,
    meaning: field.meaning || "",
    modelPrompt: stripConfidenceText(field.modelPrompt || ""),
    outputRequirement: stripConfidenceText(field.outputRequirement || ""),
    allowedValues: stripConfidenceText(field.allowedValues || ""),
    enabled: field.enabled !== false,
    requiresEvidence: field.requiresEvidence !== false
  }));
}

function normalizeDiagnosisLayer(layer) {
  const current = layer && typeof layer === "object" ? layer : {};
  return {
    enabled: current.enabled !== false,
    description: current.description || "诊断层只读取事实层输出，按配置规则命中销售接待问题。",
    checkObjects: normalizeCheckObjects(current.checkObjects),
    rules: Array.isArray(current.rules) && current.rules.length ? current.rules : defaultDiagnosisRules(),
    scoring: current.scoring || { baseScore: 100, highPenalty: 8, mediumHighPenalty: 5, mediumPenalty: 3, lowPenalty: 0 },
    derivedRules: normalizeDerivedDiagnosisRules(current.derivedRules)
  };
}

function normalizeDerivedDiagnosisRules(rules) {
  const current = rules && typeof rules === "object" ? rules : {};
  return {
    needDiscovery: { sufficientMin: Number(current.needDiscovery?.sufficientMin ?? 3), generalMin: Number(current.needDiscovery?.generalMin ?? 2), totalCoreItems: 4 },
    productExplanation: { matchedPairMin: Number(current.productExplanation?.matchedPairMin ?? 1) },
    objectionHandling: { effectiveActionMin: Number(current.objectionHandling?.effectiveActionMin ?? 2) },
    followUpClosure: {
      requiredElements: Array.isArray(current.followUpClosure?.requiredElements) && !current.followUpClosure.requiredElements.some((item) => ["next_step_action", "owner"].includes(item))
        ? current.followUpClosure.requiredElements
        : ["follow_up_offer", "followup_time", "customer_response"]
    },
    strengthSummary: { maxItems: Number(current.strengthSummary?.maxItems ?? 3) },
    weaknessSummary: { maxItems: Number(current.weaknessSummary?.maxItems ?? 5) }
  };
}

function normalizeCustomerInsightRules(rules) {
  const current = rules && typeof rules === "object" ? rules : {};
  return {
    description: "客户标签由事实信号和配置规则计算，不由大模型直接输出等级。",
    objectionStrength: {
      highBlockedActionMin: Number(current.objectionStrength?.highBlockedActionMin ?? 1),
      highOccurrenceMin: Number(current.objectionStrength?.highOccurrenceMin ?? 2)
    },
    intent: {
      highMin: Number(current.intent?.highMin ?? 7),
      mediumHighMin: Number(current.intent?.mediumHighMin ?? 4),
      mediumMin: Number(current.intent?.mediumMin ?? 1),
      weights: {
        order_or_deposit: Number(current.intent?.weights?.order_or_deposit ?? 8),
        near_purchase_timeline: Number(current.intent?.weights?.near_purchase_timeline ?? 3),
        quote_or_discount: Number(current.intent?.weights?.quote_or_discount ?? 2),
        test_drive: Number(current.intent?.weights?.test_drive ?? 2),
        next_step_agreed: Number(current.intent?.weights?.next_step_agreed ?? 2),
        clear_need_or_budget: Number(current.intent?.weights?.clear_need_or_budget ?? 1),
        explicit_refusal: Number(current.intent?.weights?.explicit_refusal ?? -8),
        no_purchase_need: Number(current.intent?.weights?.no_purchase_need ?? -6)
      }
    },
    followUp: {
      highIntentLevels: Array.isArray(current.followUp?.highIntentLevels) ? current.followUp.highIntentLevels : ["高意向", "中高意向"],
      stopOnNoContactRequest: current.followUp?.stopOnNoContactRequest !== false,
      stopOnInvalidReception: current.followUp?.stopOnInvalidReception !== false
    }
  };
}

function normalizeCheckObjects(objects) {
  const current = Array.isArray(objects) ? objects : [];
  const defaults = defaultCheckObjects();
  const byCode = new Map();
  for (const item of [...defaults, ...current]) {
    const code = item.code || item.field || item.key;
    if (!code) continue;
    byCode.set(code, {
      enabled: item.enabled !== false,
      code,
      name: item.name || item.label || code,
      type: item.type || "SOP动作",
      description: item.description || item.meaning || "",
      llmMeaning: item.llmMeaning || item.modelPrompt || item.description || "",
      judgmentRule: item.judgmentRule || item.positiveCriteria || "",
      evidenceRequirement: item.evidenceRequirement || "必须引用当前接待原文或时间戳证据；无法确认时输出未提及或未完成。"
    });
  }
  return Array.from(byCode.values());
}

function normalizeStrategyLayer(layer, base) {
  const current = layer && typeof layer === "object" ? layer : {};
  return {
    enabled: current.enabled !== false,
    unmatchedPolicy: current.unmatchedPolicy || "显示待配置策略，不自动编造策略",
    strategies: Array.isArray(current.strategies) && current.strategies.length ? current.strategies : base.strategyLibrary,
    legacyTemplates: base.strategyTemplates
  };
}

function normalizeGenerationLayer(layer, base) {
  const current = layer && typeof layer === "object" ? layer : {};
  const customerLevelRules = current.customerLevelRules && typeof current.customerLevelRules === "object" ? current.customerLevelRules : {};
  return {
    enabled: current.enabled !== false,
    defaultMode: current.defaultMode || "template",
    allowLlmRewrite: Boolean(current.allowLlmRewrite),
    rewriteBoundary: current.rewriteBoundary || "只允许润色表达，不允许重新判断事实、诊断或策略。",
    specs: current.specs && typeof current.specs === "object" ? current.specs : base.generationSpecs,
    customerLevelRules: {
      enabled: customerLevelRules.enabled !== false,
      speakerRule: "仅统计客户或主客户原话，销售、未知角色和模型摘要不计分",
      countMode: "同一关键词每通会话仅计一次",
      levels: Array.isArray(customerLevelRules.levels) && customerLevelRules.levels.length ? customerLevelRules.levels : defaultCustomerLevelRules(),
      managerAlert: {
        enabled: customerLevelRules.managerAlert?.enabled !== false,
        triggerLevel: customerLevelRules.managerAlert?.triggerLevel || "三级",
        channel: customerLevelRules.managerAlert?.channel || "店长企业微信群机器人",
        recipientRole: customerLevelRules.managerAlert?.recipientRole || "店长",
        webhookEnv: "MANAGER_WECHAT_WEBHOOK"
      }
    }
  };
}

function defaultCustomerLevelRules() {
  return [
    { level: "一级", name: "基础咨询意向", description: "弱意向，仅常规了解，无明确购车信号", score: 1, threshold: 1, keywords: ["之前看过", "之前了解过", "新款么", "保险多少钱", "交付中心", "在哪提车", "5.26指标", "推荐来看"], excludedPhrases: [] },
    { level: "二级", name: "深度了解意向", description: "中意向，主动关注购车成本、用车周期，有潜在购车需求", score: 3, threshold: 3, keywords: ["试驾过", "试车位", "等车周期", "现车", "金融方案", "优惠", "算价", "送什么", "交车时间", "能上门吗", "朋友刚提车", "指标到期"], excludedPhrases: [] },
    { level: "三级", name: "高意向核心词", description: "强意向，直接触及订车、成交、置换落地，具备即时成交可能", score: 6, threshold: 6, keywords: ["订车", "置换", "报废", "近期用车", "合适就定", "首付", "月供", "还有什么权益"], excludedPhrases: ["不订车", "不置换", "不报废", "没有近期用车计划", "不需要首付", "不考虑月供"] }
  ];
}

function normalizeFeedbackLayer(layer, base) {
  const current = layer && typeof layer === "object" ? layer : {};
  return {
    enabled: current.enabled !== false,
    actors: Array.isArray(current.actors) && current.actors.length ? current.actors : ["sales", "manager", "operations", "qa"],
    actionsByActor: current.actionsByActor && typeof current.actionsByActor === "object" ? current.actionsByActor : base.feedbackOptions,
    targetTypes: Array.isArray(current.targetTypes)
      ? current.targetTypes
      : ["fact_field", "diagnosis", "strategy", "generated_card", "transcript_correction", "business_outcome"],
    overwritePolicy: current.overwritePolicy || "反馈只记录事件和效果；覆盖事实必须走人工修正版本。"
  };
}

function defaultCheckObjects() {
  const object = (code, name, type, description, llmMeaning, judgmentRule, evidenceRequirement) => ({
    enabled: true,
    code,
    name,
    type,
    description,
    llmMeaning,
    judgmentRule,
    evidenceRequirement
  });
  return [
    object("greeted_customer", "问候开场", "SOP动作", "检查销售是否对客户完成基础问候或开场接待。", "识别销售是否出现欢迎、您好、请问、今天想看什么等接待开场表达。", "销售有明确问候或开场引导则视为完成；只有闲聊或客户先发起且销售未回应，不视为完成。", "引用销售开场或客户刚进店后的原文。"),
    object("asked_use_case", "询问用途/用车场景", "SOP动作", "检查销售是否确认客户买车或看车的主要使用场景。", "识别销售是否询问家用、通勤、商务、接送老人孩子、长途、自驾等用途。", "销售主动询问或基于客户表达复述确认用途则完成；客户自说但销售没有确认可作为客户事实，不等同于销售动作完成。", "引用销售询问用途或客户明确用途表达。"),
    object("asked_budget", "询问预算", "SOP动作", "检查销售是否确认客户预算、价格接受范围、首付或月供。", "识别预算、价位、首付、月供、落地价、价格接受范围等预算相关表达。", "销售主动询问预算或确认价格承受范围则完成；只报价不问预算不算完成。", "引用预算、价格接受范围、首付或月供相关原文。"),
    object("asked_purchase_timeline", "询问购车周期", "SOP动作", "检查销售是否确认客户计划什么时候购买或再次到店。", "识别今天、近期、月底、周末、什么时候定、购车时间、复店时间等周期表达。", "销售主动询问或确认购买时间则完成；客户只说随便看看且销售未追问不算完成。", "引用购买时间、复店时间或周期相关原文。"),
    object("asked_decision_maker", "询问决策人/影响人", "SOP动作", "检查销售是否确认谁参与购买决策。", "识别家人、老婆、老公、父母、孩子、领导、朋友、一起商量等决策链表达。", "销售主动询问或确认决策人则完成；客户提到家人但销售未继续确认时，只形成客户事实。", "引用决策人、影响人或商量对象相关原文。"),
    object("introduced_product_by_need", "结合需求讲解产品", "SOP动作", "检查销售讲解是否围绕客户已表达需求。", "识别销售是否把空间、安全、智能、价格、舒适、续航等卖点与客户需求进行匹配。", "销售讲解明确回应客户关注点则完成；泛泛介绍配置但没有对应客户需求，不算完成。", "引用客户需求和销售对应讲解的原文。"),
    object("invited_test_drive", "邀约试驾", "SOP动作", "检查销售是否推进客户试驾或体验。", "识别试驾、体验、开一下、约试驾、带家人试驾等表达。", "销售明确提出试驾或约定体验则完成；仅客户说还没试过但销售没安排，不算完成。", "引用试驾邀约或体验安排原文。"),
    object("quoted_price", "报价/解释费用", "SOP动作", "检查销售是否报价或解释落地价、优惠、费用构成。", "识别报价、落地价、优惠、首付、月供、保险、上牌、金融等费用表达。", "销售给出价格信息或费用方案则完成；客户问价格但销售回避，不算完成。", "引用报价、优惠或费用构成原文。"),
    object("handled_objection", "处理客户异议", "SOP动作", "检查销售是否对客户异议进行解释、拆解或推进。", "识别客户提出价格、竞品、家人、交付、售后、金融等异议后，销售是否有对应回应。", "销售回应能针对异议提供解释、方案或下一步动作则完成；简单敷衍或转移话题不算完成。", "引用客户异议和销售回应原文。"),
    object("confirmed_next_followup", "确认下一步跟进", "SOP动作", "检查销售是否在离店或报价后确认下一步安排。", "识别明天联系、发资料、加微信、约复店、带家人再来、下次试驾等闭环动作。", "销售明确约定下一步动作、时间或渠道则完成；只说再联系但无具体动作可判为弱闭环。", "引用跟进时间、渠道、资料发送或复店安排原文。"),
    object("need_discovery", "销售需求确认完整度", "销售行为质量", "检查销售是否主动询问或复述确认用途、预算、周期和决策人。", "客户主动表达形成客户事实；销售是否询问或复述确认形成销售行为事实，两者分开判断。", "销售确认动作不足时命中；不得把客户已表达的用途、预算或关注点写成缺失。", "逐项引用事实层的已明确、部分明确、未明确状态及销售确认动作。"),
    object("decision_chain_status", "决策链状态", "客户画像", "检查客户决策链是否明确和闭合。", "识别客户是否需要家人、配偶、领导、朋友参与决策，以及销售是否形成后续闭环。", "客户提到影响人但未确认共同看车、复店或跟进安排时，视为决策链未闭合。", "引用客户提到影响人和销售跟进安排原文。"),
    object("价格", "价格/金融异议", "客户异议", "检查客户是否对价格、预算、优惠、首付、月供或金融方案存在异议。", "识别贵、预算不够、比竞品贵、首付/月供压力、优惠不满意等表达。", "客户明确表达价格顾虑且销售未有效拆解时，可命中价格异议处理不足。", "引用客户价格异议和销售回应原文。"),
    object("竞品", "竞品异议", "客户异议", "检查客户是否提及竞品并进行对比或质疑。", "识别比亚迪、特斯拉、理想、问界、其他店、别家、同级车型等竞品表达。", "客户提及竞品但销售未澄清比较维度或差异化回应时，可命中竞品异议未处理。", "引用竞品提及和销售回应原文。"),
    object("intent_level", "客户意向等级", "客户画像", "检查客户当前购买意向水平。", "识别试驾、报价、复店、下订、犹豫、再看看、不急等意向信号。", "高意向或中高意向客户叠加异议、未闭环等问题时，可触发高意向流失风险。", "引用购买信号、异议和下一步安排相关原文。"),
    object("risk_segments", "合规/体验风险片段", "风险红线", "检查是否出现承诺、误导、投诉或服务体验风险。", "识别保证最低价、贷款肯定通过、绝对承诺、贬低竞品、客户投诉或明显不满等风险表达。", "出现高风险表达时默认进入人工复核，不直接作为最终责任认定。", "引用风险原话、说话人和时间戳。")
  ];
}

function defaultDiagnosisRules() {
  return [
    rule("reception-no-greeting", "未问候开场", "接待基础", "低", "missing_sop", "greeted_customer", "问候开场缺失", false),
    rule("need-discovery-insufficient", "销售需求确认不足", "需求挖掘", "中", "sop_count_lte", "need_discovery", "销售未充分询问或复述确认关键需求；客户已主动表达的事实不计为缺失", true),
    rule("budget-not-confirmed", "预算未确认", "需求挖掘", "中", "missing_sop_and_fact", "asked_budget", "未确认客户预算或价格承受范围", true),
    rule("timeline-not-confirmed", "购车周期未确认", "需求挖掘", "中", "missing_sop_and_fact", "asked_purchase_timeline", "未确认客户购买周期", true),
    rule("decision-chain-open", "决策链未闭合", "异议处理", "高", "decision_chain_open", "decision_chain_status", "客户提到家人/领导等决策人，但未形成复店或跟进闭环", true, true),
    rule("price-objection-unhandled", "价格异议处理不足", "报价议价", "高", "objection_unhandled", "价格", "客户出现价格/预算异议，销售未有效拆解", true, true),
    rule("competitor-objection-unhandled", "竞品异议未处理", "异议处理", "中高", "objection_unhandled", "竞品", "客户提及竞品但销售未澄清比较维度或差异化回应", true),
    rule("product-mismatch", "产品讲解偏离客户需求", "产品讲解", "中", "product_mismatch", "introduced_product_by_need", "销售讲解未围绕客户关注点展开", true),
    rule("test-drive-not-promoted", "试驾推进不足", "体验推进", "中", "missing_sop_when_intent", "invited_test_drive", "客户有意向但未推进试驾或体验", true),
    rule("quote-followup-missing", "报价后推进不足", "报价议价", "高", "quote_without_followup", "quoted_price", "报价后没有确认预算差距或下一步", true, true),
    rule("followup-closure-missing", "离店跟进闭环缺失", "成交闭环", "高", "missing_sop", "confirmed_next_followup", "未明确下次联系、资料发送或复店安排", true, true),
    rule("high-intent-loss-risk", "高意向客户流失风险", "成交闭环", "高", "high_intent_with_high_risk", "intent_level", "中高/高意向客户存在高风险问题", true, true),
    rule("compliance-review-required", "合规风险需人工复核", "合规风险", "高", "risk_segments_present", "risk_segments", "出现承诺、误导、投诉等风险片段", false, true)
  ];
}

function rule(ruleId, issue, category, riskLevel, conditionType, conditionField, reason, recoverable, manualReviewRequired = false) {
  return {
    enabled: true,
    ruleId,
    issue,
    category,
    riskLevel,
    conditionType,
    conditionField,
    reason,
    recoverable,
    manualReviewRequired,
    evidenceSelector: conditionField
  };
}

function stripConfidenceText(text) {
  return String(text)
    .replace(/、?confidence/gi, "")
    .replace(/、?置信度/g, "")
    .replace(/，?不输出字段/g, "")
    .trim();
}
