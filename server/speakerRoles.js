import { env } from "./env.js";

export async function mapAnonymousSpeakersWithLlm(utterances) {
  const speakers = [...new Set(utterances.map((item) => item.role).filter((role) => /^说话人\d+$/.test(role)))];
  if (speakers.length < 2) {
    throw new Error("当前转写没有至少两个匿名说话人，不能进行销售/客户语义标定。请先完成ASR说话人分离和本通声纹精修。");
  }

  const baseUrl = env("LLM_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "");
  const apiKey = env("LLM_API_KEY");
  const model = env("LLM_MODEL");
  if (!apiKey || !model) throw new Error("千问大模型未配置，不能进行销售/客户语义标定。");

  const transcript = utterances
    .filter((item) => speakers.includes(item.role))
    .map((item) => `[${formatTime(item.startSec)}] ${item.role}：${item.text}`)
    .join("\n");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      temperature: 0,
      enable_thinking: false,
      messages: [
        {
          role: "system",
          content: "你是汽车门店对话角色标定器。匿名说话人已由当前录音内的声纹分离产生。你只根据整通对话的业务语义，将一个匿名说话人标定为销售、另一个标定为主客户。不得识别具体人员，不得逐句改变同一说话人的角色，不得输出置信度。证据不足时status输出待复核。"
        },
        {
          role: "user",
          content: `匿名说话人范围：${speakers.join("、")}\n\n${transcript}\n\n只返回JSON：{"status":"已标定或待复核","mapping":[{"speaker":"说话人0","role":"销售或主客户","evidence":["带时间戳的原文依据"]}]}`
        }
      ]
    })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`大模型角色标定失败：${payload?.error?.message || response.status}`);
  const parsed = parseJson(payload.choices?.[0]?.message?.content || "{}");
  const mapping = Array.isArray(parsed.mapping)
    ? parsed.mapping.filter((item) => speakers.includes(item.speaker) && ["销售", "主客户"].includes(item.role))
    : [];
  const mappedRoles = new Set(mapping.map((item) => item.role));
  if (parsed.status !== "已标定" || !mappedRoles.has("销售") || !mappedRoles.has("主客户")) {
    throw new Error("整通对话语义不足，暂时无法将匿名说话人稳定标定为销售和客户，请人工复核。");
  }
  return { status: "已标定", mapping };
}

function parseJson(value) {
  const text = String(value).replace(/^```json\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("大模型角色标定返回格式不正确。");
  }
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
