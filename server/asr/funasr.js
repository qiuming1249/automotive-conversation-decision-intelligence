import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { env } from "../env.js";

export function getFunAsrConfig() {
  return {
    provider: env("ASR_PROVIDER", "none"),
    endpoint: env("FUNASR_ENDPOINT", "http://127.0.0.1:10095/asr"),
    audioField: env("FUNASR_AUDIO_FIELD", "audio"),
    responsePath: env("FUNASR_RESPONSE_PATH", "auto")
  };
}

export function getFunAsrConfigStatus() {
  const config = getFunAsrConfig();
  const missing = [];
  if (config.provider !== "funasr") missing.push("ASR_PROVIDER=funasr");
  if (!config.endpoint) missing.push("FUNASR_ENDPOINT");
  return {
    provider: config.provider,
    configured: missing.length === 0,
    missing,
    endpoint: config.endpoint,
    audioField: config.audioField,
    responsePath: config.responsePath
  };
}

export async function transcribeWithFunAsr(filePath) {
  const config = getFunAsrConfig();
  const status = getFunAsrConfigStatus();
  if (!status.configured) {
    throw new Error(`FunASR配置不完整：${status.missing.join("、")}`);
  }
  const bytes = readFileSync(filePath);
  const contentType = contentTypeFromExt(extname(filePath));
  const form = new FormData();
  form.set(config.audioField || "audio", new Blob([bytes], { type: contentType }), basename(filePath));
  form.set("mode", "offline");
  form.set("hotwords", "");

  const response = await fetch(config.endpoint, {
    method: "POST",
    body: form
  });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`FunASR请求失败：${response.status} ${rawText.slice(0, 160)}`);
  }
  const payload = tryJson(rawText);
  const text = extractText(payload, config.responsePath);
  if (!text) {
    throw new Error(`FunASR返回中未找到转写文本：${rawText.slice(0, 240)}`);
  }
  return splitTextToUtterances(text, payload);
}

function extractText(payload, path) {
  if (typeof payload === "string") return payload;
  if (path && path !== "auto") {
    return path.split(".").reduce((value, key) => value?.[key], payload) || "";
  }
  const candidates = [
    payload.text,
    payload.result,
    payload.asr_text,
    payload.data?.text,
    payload.data?.result,
    payload.output?.text,
    payload.output?.result,
    Array.isArray(payload.result) ? payload.result.map((item) => item.text || item.sentence || item).join("") : "",
    Array.isArray(payload.results) ? payload.results.map((item) => item.text || item.sentence || item).join("") : ""
  ];
  return candidates.find((item) => typeof item === "string" && item.trim()) || "";
}

function splitTextToUtterances(text, payload) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : Array.isArray(payload?.result) ? payload.result : [];
  if (segments.length && typeof segments[0] === "object") {
    return segments
      .map((item, index) => ({
        startSec: Math.round(Number(item.start ?? item.begin ?? item.begin_time ?? index * 8)),
        endSec: Math.round(Number(item.end ?? item.end_time ?? index * 8 + 6)),
        role: item.speaker ? `说话人${item.speaker}` : "未知",
        text: item.text || item.sentence || "",
        confidence: Number(item.confidence ?? 0.82),
        included: true,
        status: "FunASR转写",
        issueType: ""
      }))
      .filter((item) => item.text);
  }
  return String(text)
    .split(/(?<=[。！？?])\s*/)
    .filter(Boolean)
    .map((line, index) => ({
      startSec: index * 8,
      endSec: index * 8 + 6,
      role: "未知",
      text: line.trim(),
      confidence: 0.82,
      included: true,
      status: "FunASR转写",
      issueType: ""
    }));
}

function tryJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function contentTypeFromExt(ext) {
  const lower = ext.toLowerCase();
  if (lower === ".wav") return "audio/wav";
  if (lower === ".mp3") return "audio/mpeg";
  if (lower === ".m4a") return "audio/mp4";
  if (lower === ".aac") return "audio/aac";
  return "application/octet-stream";
}
