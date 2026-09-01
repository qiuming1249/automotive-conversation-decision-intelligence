const rolePattern = /(销售|坐席|顾问|客户|主客户|陪同人|同事|店长|未知|电话对方)\s*[:：]\s*(.+)$/;
const timePattern = /(?:\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]|(\d{1,2}):(\d{2})(?::(\d{2}))?)\s*/;

function toSeconds(a, b, c) {
  if (c !== undefined && c !== "") return Number(a) * 3600 + Number(b) * 60 + Number(c);
  return Number(a) * 60 + Number(b);
}

export function parseTranscript(rawText) {
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.map((line, index) => {
    let text = line;
    let startSec = index * 18;
    const timeMatch = text.match(timePattern);
    if (timeMatch && timeMatch.index === 0) {
      const [, h1, m1, s1, h2, m2, s2] = timeMatch;
      startSec = h1 ? toSeconds(h1, m1, s1) : toSeconds(h2, m2, s2);
      text = text.slice(timeMatch[0].length).trim();
    }

    const roleMatch = text.match(rolePattern);
    const role = roleMatch ? normalizeRole(roleMatch[1]) : inferRole(text, index);
    const cleanText = roleMatch ? roleMatch[2].trim() : text;
    return {
      startSec,
      endSec: startSec + Math.max(4, Math.min(16, Math.ceil(cleanText.length / 4))),
      role,
      text: cleanText,
      confidence: roleMatch ? 0.86 : 0.66,
      included: true,
      status: "AI识别",
      issueType: roleMatch ? "" : "角色未知"
    };
  });
}

export function normalizeRole(role) {
  if (["销售", "坐席", "顾问"].includes(role)) return "销售";
  if (["客户", "主客户"].includes(role)) return "主客户";
  if (role === "陪同人") return "陪同人";
  if (role === "同事") return "同事";
  if (role === "店长") return "店长";
  if (role === "电话对方") return "电话对方";
  return "未知";
}

function inferRole(text, index) {
  if (/您|需要|可以|这款|方案|试驾|报价|优惠|我帮/.test(text)) return "销售";
  if (/贵|便宜|预算|考虑|看看|家人|老婆|竞品|比亚迪|特斯拉|多少钱/.test(text)) return "主客户";
  return index % 2 === 0 ? "主客户" : "销售";
}
