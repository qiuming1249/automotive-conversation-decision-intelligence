import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = parts.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
}

export function env(name, fallback = "") {
  return process.env[name] || fallback;
}

export function setEnvValues(values) {
  const current = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      const [key, ...parts] = trimmed.split("=");
      current[key] = parts.join("=").replace(/^['"]|['"]$/g, "");
    }
  }
  for (const [key, value] of Object.entries(values)) {
    current[key] = value ?? "";
    process.env[key] = value ?? "";
  }
  const order = [
    "ASR_PROVIDER",
    "FUNASR_ENDPOINT",
    "FUNASR_AUDIO_FIELD",
    "FUNASR_RESPONSE_PATH",
    "ALIYUN_ACCESS_KEY_ID",
    "ALIYUN_ACCESS_KEY_SECRET",
    "ALIYUN_NLS_APP_KEY",
    "ALIYUN_REGION",
    "ALIYUN_FILETRANS_ENDPOINT",
    "ALIYUN_ASR_PUBLIC_BASE_URL",
    "ALIYUN_ASR_DIARIZATION_ENABLED",
    "ALIYUN_ASR_SPEAKER_COUNT",
    "ALIYUN_OSS_BUCKET",
    "ALIYUN_OSS_REGION",
    "ALIYUN_OSS_ENDPOINT",
    "ALIYUN_OSS_PREFIX",
    "LLM_BASE_URL",
    "LLM_API_KEY",
    "LLM_MODEL",
    "MANAGER_WECHAT_WEBHOOK",
    "MANAGER_WECHAT_USER_IDS",
    "MANAGER_WECHAT_MOBILES"
  ];
  const keys = [...order, ...Object.keys(current).filter((key) => !order.includes(key))];
  const content = keys
    .filter((key, index) => keys.indexOf(key) === index)
    .map((key) => `${key}=${current[key] ?? ""}`)
    .join("\n");
  writeFileSync(envPath, `${content}\n`);
}
