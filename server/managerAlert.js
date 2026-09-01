const sentAlertKeys = new Set();

function buildAlertKey(session, card) {
  return `${session.id}:${card.title}:${card.content}`;
}

function splitRecipients(value) {
  return String(value || "").split(/[、,，;；\s]+/).map((item) => item.trim()).filter(Boolean);
}

function buildText(session, card) {
  const evidence = (card.evidence || []).slice(0, 3)
    .map((item) => `> ${item.timestamp || "--:--"} ${item.speaker || "客户"}：${item.quote || ""}`)
    .join("\n");
  return [
    "【三级客户意向预警】",
    `接待编号：${session.reception_no || session.id}`,
    `门店：${session.store || "未填写"}`,
    `销售：${session.salesperson || session.sales || "未填写"}`,
    `客户：${session.customer_name || session.customer || "临时客户"}`,
    `意向等级：${card.title}`,
    "",
    card.content,
    evidence ? `\n客户原话证据：\n${evidence}` : "",
    "",
    "请店长及时介入，并在平台记录处理结果。"
  ].filter(Boolean).join("\n");
}

export async function deliverManagerAlerts(cards = [], session = {}) {
  const webhook = String(process.env.MANAGER_WECHAT_WEBHOOK || "").trim();
  const mentionedList = splitRecipients(process.env.MANAGER_WECHAT_USER_IDS);
  const mentionedMobileList = splitRecipients(process.env.MANAGER_WECHAT_MOBILES);
  const targets = cards.filter((card) => card.managerAlert?.required);
  for (const card of targets) {
    if (!webhook) {
      card.managerAlert.status = "待配置企业微信机器人地址";
      continue;
    }
    if (!mentionedList.length && !mentionedMobileList.length) {
      card.managerAlert.status = "待填写店长企业微信用户ID或手机号";
      continue;
    }
    const key = buildAlertKey(session, card);
    if (sentAlertKeys.has(key)) {
      card.managerAlert.status = "已推送店长企业微信群";
      continue;
    }
    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          msgtype: "text",
          text: {
            content: buildText(session, card),
            mentioned_list: mentionedList,
            mentioned_mobile_list: mentionedMobileList
          }
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || Number(payload.errcode || 0) !== 0) {
        throw new Error(payload.errmsg || `HTTP ${response.status}`);
      }
      sentAlertKeys.add(key);
      card.managerAlert.status = "已推送店长企业微信群";
      card.managerAlert.sentAt = new Date().toISOString();
    } catch (error) {
      card.managerAlert.status = `推送失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  return cards;
}
