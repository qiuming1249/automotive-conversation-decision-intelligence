import { db } from "./db.js";

const base = "http://127.0.0.1:8787";
const sample = "[00:01] 销售：您好。\n[00:03] 客户：我想了解一下。";

let createdId = "";
try {
  const seed = db.prepare("SELECT * FROM analyses ORDER BY analyzed_at DESC LIMIT 1").get();
  if (!seed) throw new Error("没有可用于联动测试的现有事实包，请先完成一条真实接待分析。");

  const create = await fetch(`${base}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ store: "自动化测试门店", salesperson: "自动化测试销售", customerName: "自动化测试客户", asrText: sample })
  });
  if (!create.ok) throw new Error(`create failed ${create.status}`);
  const created = await create.json();
  createdId = created.session.id;

  db.prepare(`
    INSERT INTO analyses (session_id, based_on_version, fact_package, diagnoses, strategies, generated_cards, semantic_package, score, analyzed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(createdId, created.session.activeVersion, seed.fact_package, seed.diagnoses, seed.strategies, seed.generated_cards, seed.semantic_package, seed.score, new Date().toISOString());

  const beforeDiagnoses = JSON.parse(seed.diagnoses || "[]");
  const beforeStrategies = JSON.parse(seed.strategies || "[]");
  const patch = await fetch(`${base}/api/sessions/${createdId}/facts`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      edits: [
        { factCode: "customer.budget", value: "预算上限15万元，首付3万元", status: "已明确" },
        { factCode: "customer.purchase_timeline", value: "一个月内", status: "已明确" },
        { factCode: "sales.ask_budget", value: "已执行", status: "已执行" },
        { factCode: "sales.ask_purchase_timeline", value: "已执行", status: "已执行" },
        { factCode: "sales.confirm_followup", value: "已执行", status: "已执行" }
      ]
    })
  });
  if (!patch.ok) throw new Error(`fact patch failed ${patch.status}: ${await patch.text()}`);
  const updated = await patch.json();
  const table = updated.analysis?.factPackage?.decisionFactTable || [];
  const budget = table.find((item) => item.factCode === "customer.budget");
  if (budget?.value !== "预算上限15万元，首付3万元" || budget?.source !== "人工修正") throw new Error("事实修正没有写回标准事实表");
  if (!(updated.analysis?.factPackage?.factCorrections || []).length) throw new Error("事实修正记录没有持久化");

  const downstreamChanged =
    JSON.stringify(beforeDiagnoses) !== JSON.stringify(updated.analysis?.diagnoses || []) ||
    JSON.stringify(beforeStrategies) !== JSON.stringify(updated.analysis?.strategies || []) ||
    Number(seed.score) !== Number(updated.analysis?.score);
  if (!downstreamChanged) throw new Error("事实变化后诊断、策略和评分均未变化");
  const configuredStrategy = (updated.analysis?.strategies || []).find((item) => item.strategyId !== "pending_strategy_config");
  if (configuredStrategy && (!configuredStrategy.strategyTitle || !configuredStrategy.strategyObjective || !configuredStrategy.actionSteps?.length)) {
    throw new Error("策略层没有生成面向销售的策略名称、目标和执行步骤");
  }
  if ((updated.analysis?.generatedCards || []).some((item) => item.id === "card_next_action" || item.type === "下一步跟进建议")) {
    throw new Error("生成层仍包含与策略层重复的下一步跟进建议卡片");
  }

  console.log(JSON.stringify({
    ok: true,
    factSource: budget.source,
    before: { diagnoses: beforeDiagnoses.length, strategies: beforeStrategies.length, score: seed.score },
    after: { diagnoses: updated.analysis.diagnoses.length, strategies: updated.analysis.strategies.length, cards: updated.analysis.generatedCards.length, score: updated.analysis.score }
  }, null, 2));
} finally {
  if (createdId) db.prepare("DELETE FROM sessions WHERE id = ?").run(createdId);
}
