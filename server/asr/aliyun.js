import { createHmac, randomUUID } from "node:crypto";
import { extname } from "node:path";
import { env } from "../env.js";

const API_VERSION = "2018-08-17";

export function getAliyunAsrConfig() {
  const region = env("ALIYUN_REGION", "cn-shanghai");
  const endpoint = env("ALIYUN_FILETRANS_ENDPOINT", `https://filetrans.${region}.aliyuncs.com`);
  return {
    provider: env("ASR_PROVIDER", "none"),
    accessKeyId: env("ALIYUN_ACCESS_KEY_ID"),
    accessKeySecret: env("ALIYUN_ACCESS_KEY_SECRET"),
    appKey: env("ALIYUN_NLS_APP_KEY"),
    region,
    endpoint,
    publicBaseUrl: env("ALIYUN_ASR_PUBLIC_BASE_URL"),
    diarizationEnabled: env("ALIYUN_ASR_DIARIZATION_ENABLED", "true") !== "false",
    speakerCount: Math.max(0, Number(env("ALIYUN_ASR_SPEAKER_COUNT", "0")) || 0)
  };
}

export function getAsrConfigStatus() {
  const config = getAliyunAsrConfig();
  const missing = [];
  if (config.provider !== "aliyun") missing.push("ASR_PROVIDER=aliyun");
  if (!config.accessKeyId) missing.push("ALIYUN_ACCESS_KEY_ID");
  if (!config.accessKeySecret) missing.push("ALIYUN_ACCESS_KEY_SECRET");
  if (!config.appKey) missing.push("ALIYUN_NLS_APP_KEY");
  if (!config.publicBaseUrl) missing.push("ALIYUN_ASR_PUBLIC_BASE_URL 或 OSS公网音频URL");
  return {
    provider: config.provider,
    configured: missing.length === 0,
    missing,
    region: config.region,
    endpoint: config.endpoint,
    publicBaseUrl: config.publicBaseUrl,
    publicBaseUrlConfigured: Boolean(config.publicBaseUrl),
    diarizationEnabled: config.diarizationEnabled,
    speakerCount: config.speakerCount
  };
}

export function buildPublicAudioUrl(audioPath) {
  const config = getAliyunAsrConfig();
  if (!config.publicBaseUrl || !audioPath) return "";
  const base = config.publicBaseUrl.replace(/\/$/, "");
  const path = audioPath.startsWith("/") ? audioPath : `/${audioPath}`;
  return `${base}${path}`;
}

export async function submitAliyunFileTranscription(audioUrl) {
  const config = getAliyunAsrConfig();
  assertConfigured(config);
  if (!/^https?:\/\//.test(audioUrl)) {
    throw new Error("阿里云录音文件识别需要公网可访问的音频URL。");
  }

  const task = {
    appkey: config.appKey,
    file_link: audioUrl,
    version: "4.0",
    enable_words: false,
    enable_sample_rate_adaptive: true,
    enable_inverse_text_normalization: true,
    auto_split: config.diarizationEnabled,
    supervise_type: config.speakerCount > 0 ? 1 : 2,
    ...(config.speakerCount > 0 ? { speaker_num: config.speakerCount } : {})
  };
  const result = await callRpc(config, {
    Action: "SubmitTask",
    Task: JSON.stringify(task)
  }, "POST");
  const taskId = result.TaskId || result.task_id || result.Data?.TaskId;
  if (!taskId) {
    throw new Error(formatAliyunTaskError(result));
  }
  return { taskId, raw: result };
}

export async function getAliyunFileTranscriptionResult(taskId) {
  const config = getAliyunAsrConfig();
  assertConfigured(config);
  const result = await callRpc(config, {
    Action: "GetTaskResult",
    TaskId: taskId
  }, "GET");
  const statusText = result.StatusText || result.status_text || result.Data?.StatusText || "";
  const isComplete = /SUCCESS|SUCCEEDED|COMPLETED|SUCCESSFUL/i.test(statusText) || Boolean(result.Result);
  const isFailed = /FAIL|ERROR|TIMEOUT|QUOTA|EXCEED/i.test(statusText);
  return {
    taskId,
    statusText: statusText || (isComplete ? "SUCCESS" : "RUNNING"),
    isComplete,
    isFailed,
    utterances: isComplete ? parseAliyunResult(result) : [],
    raw: result
  };
}

function formatAliyunTaskError(result) {
  const statusText = result.StatusText || result.status_text || result.Data?.StatusText || "";
  const statusCode = result.StatusCode || result.status_code || result.Data?.StatusCode || "";
  if (statusText === "USER_BIZDURATION_QUOTA_EXCEED" || String(statusCode) === "41050001") {
    return `阿里云ASR额度不足：USER_BIZDURATION_QUOTA_EXCEED（StatusCode ${statusCode || "41050001"}）。当前AppKey/账号的录音识别业务时长额度已超限，请在阿里云开通或补充智能语音交互录音文件识别额度，或更换有额度的NLS AppKey。`;
  }
  if (statusText || statusCode) {
    return `阿里云ASR提交失败：${statusText || "UNKNOWN"}${statusCode ? `（StatusCode ${statusCode}）` : ""}`;
  }
  return `阿里云ASR提交成功但未返回TaskId：${JSON.stringify(result)}`;
}

function assertConfigured(config) {
  const status = getAsrConfigStatus();
  if (!status.configured) {
    throw new Error(`阿里云ASR配置不完整：${status.missing.join("、")}`);
  }
  if (config.provider !== "aliyun") {
    throw new Error("ASR_PROVIDER 不是 aliyun。");
  }
}

async function callRpc(config, params, method = "POST") {
  const baseParams = {
    Format: "JSON",
    Version: API_VERSION,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: randomUUID(),
    SignatureVersion: "1.0",
    AccessKeyId: config.accessKeyId,
    Timestamp: new Date().toISOString(),
    ...params
  };
  const signedParams = signRpcParams(config, method, baseParams);
  const response =
    method === "GET"
      ? await fetch(`${config.endpoint}/?${signedParams}`)
      : await fetch(`${config.endpoint}/`, {
          method,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: signedParams
        });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`阿里云ASR返回非JSON：${text.slice(0, 200)}`);
  }
  if (!response.ok || json.Code || json.ErrorCode) {
    throw new Error(json.Message || json.ErrorMessage || `阿里云ASR请求失败：${response.status}`);
  }
  return json;
}

function signRpcParams(config, method, params) {
  const encoded = Object.keys(params)
    .sort()
    .map((key) => `${percentEncode(key)}=${percentEncode(params[key])}`)
    .join("&");
  const stringToSign = `${method}&${percentEncode("/")}&${percentEncode(encoded)}`;
  const signature = createHmac("sha1", `${config.accessKeySecret}&`).update(stringToSign).digest("base64");
  return `Signature=${percentEncode(signature)}&${encoded}`;
}

function percentEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~");
}

function parseAliyunResult(payload) {
  const result = typeof payload.Result === "string" ? safeJson(payload.Result) : payload.Result || payload.Data?.Result || payload;
  const sentences = result.Sentences || result.sentences || result.Transcripts || result.transcripts || [];
  if (Array.isArray(sentences) && sentences.length) {
    return sentences.map((item, index) => {
      const speakerId = item.SpeakerId ?? item.speaker_id ?? item.speakerId ?? item.ChannelId ?? item.channel_id;
      return {
        startSec: Math.round(Number(item.BeginTime ?? item.begin_time ?? item.start_time ?? index * 8000) / 1000),
        endSec: Math.round(Number(item.EndTime ?? item.end_time ?? item.endTime ?? index * 8000 + 6000) / 1000),
        role: speakerId !== undefined && speakerId !== null ? `说话人${speakerId}` : "未知",
        text: item.Text || item.text || item.Sentence || "",
        confidence: Number(item.Confidence ?? item.confidence ?? 0.82),
        included: true,
        status: "ASR转写",
        issueType: speakerId !== undefined && speakerId !== null ? "" : "角色待复核"
      };
    });
  }
  const text = result.Text || result.text || payload.Text || "";
  if (text) {
    return splitPlainText(text);
  }
  return [];
}

function splitPlainText(text) {
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
      status: "ASR转写",
      issueType: ""
    }));
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return { Text: value };
  }
}
