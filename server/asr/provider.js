import { join } from "node:path";
import { setEnvValues } from "../env.js";
import { uploadDir } from "../db.js";
import { buildPublicAudioUrl, getAliyunAsrConfig, getAliyunFileTranscriptionResult, getAsrConfigStatus as getAliyunStatus, submitAliyunFileTranscription } from "./aliyun.js";
import { getFunAsrConfig, getFunAsrConfigStatus, transcribeWithFunAsr } from "./funasr.js";
import { getOssConfigStatus, uploadToOssAndGetSignedUrl } from "./oss.js";

export function getUnifiedAsrConfigStatus() {
  const provider = process.env.ASR_PROVIDER || "none";
  const aliyun = getAliyunStatus();
  const funasr = getFunAsrConfigStatus();
  if (provider === "funasr") {
    return { ...funasr, provider, activeProvider: "funasr", aliyun, funasr };
  }
  if (provider === "aliyun") {
    const oss = getOssConfigStatus();
    const missing = [...aliyun.missing.filter((item) => !item.includes("ALIYUN_ASR_PUBLIC_BASE_URL")), ...oss.missing];
    return { ...aliyun, configured: missing.length === 0, missing, provider, activeProvider: "aliyun", aliyun, funasr, oss };
  }
  return {
    provider,
    activeProvider: "none",
    configured: false,
    missing: ["ASR_PROVIDER=funasr 或 ASR_PROVIDER=aliyun"],
    aliyun,
    funasr
  };
}

export function saveAsrConfig(input) {
  const provider = input.provider || "funasr";
  const values = {
    ASR_PROVIDER: provider,
    FUNASR_ENDPOINT: input.funasrEndpoint || getFunAsrConfig().endpoint,
    FUNASR_AUDIO_FIELD: input.funasrAudioField || "audio",
    FUNASR_RESPONSE_PATH: input.funasrResponsePath || "auto",
    ALIYUN_REGION: input.aliyunRegion || process.env.ALIYUN_REGION || "cn-shanghai",
    ALIYUN_FILETRANS_ENDPOINT: input.aliyunFileTransEndpoint || process.env.ALIYUN_FILETRANS_ENDPOINT || "",
    ALIYUN_ASR_PUBLIC_BASE_URL: input.aliyunPublicBaseUrl || process.env.ALIYUN_ASR_PUBLIC_BASE_URL || "",
    ALIYUN_ASR_DIARIZATION_ENABLED: input.aliyunDiarizationEnabled === false ? "false" : process.env.ALIYUN_ASR_DIARIZATION_ENABLED || "true",
    ALIYUN_ASR_SPEAKER_COUNT: String(input.aliyunSpeakerCount ?? process.env.ALIYUN_ASR_SPEAKER_COUNT ?? "0"),
    ALIYUN_OSS_BUCKET: input.aliyunOssBucket || process.env.ALIYUN_OSS_BUCKET || "",
    ALIYUN_OSS_REGION: input.aliyunOssRegion || process.env.ALIYUN_OSS_REGION || input.aliyunRegion || process.env.ALIYUN_OSS_REGION || "cn-beijing",
    ALIYUN_OSS_ENDPOINT: input.aliyunOssEndpoint || process.env.ALIYUN_OSS_ENDPOINT || "",
    ALIYUN_OSS_PREFIX: input.aliyunOssPrefix || process.env.ALIYUN_OSS_PREFIX || "uploads"
  };
  setEnvValues(values);
  return getUnifiedAsrConfigStatus();
}

export async function startProviderAsr(session) {
  const provider = process.env.ASR_PROVIDER || "none";
  if (provider === "funasr") {
    const filename = session.audio_path?.split("/").pop();
    if (!filename) throw new Error("该接待没有录音文件。");
    const utterances = await transcribeWithFunAsr(join(uploadDir, filename));
    return {
      provider: "funasr",
      mode: "sync",
      utterances
    };
  }
  if (provider === "aliyun") {
    const filename = session.audio_path?.split("/").pop();
    if (!filename) throw new Error("该接待没有录音文件。");
    let audioUrl = "";
    if (process.env.ALIYUN_OSS_BUCKET) {
      audioUrl = await uploadToOssAndGetSignedUrl(join(uploadDir, filename));
    } else {
      audioUrl = buildPublicAudioUrl(session.audio_path);
    }
    if (!audioUrl) throw new Error("缺少 OSS bucket 或 ALIYUN_ASR_PUBLIC_BASE_URL，阿里云无法访问本地录音。");
    const submitted = await submitAliyunFileTranscription(audioUrl);
    return {
      provider: "aliyun",
      mode: "async",
      taskId: submitted.taskId
    };
  }
  throw new Error("请先在ASR配置中选择 funasr 或 aliyun。");
}

export async function pollProviderAsr(session) {
  const provider = session.asr_provider || process.env.ASR_PROVIDER || "none";
  if (provider === "funasr") {
    return {
      provider: "funasr",
      isComplete: session.active_version?.startsWith("asr_funasr"),
      isFailed: false,
      statusText: session.asr_status || "FunASR为同步转写，无需轮询。",
      utterances: []
    };
  }
  if (provider === "aliyun") {
    if (!session.asr_task_id) throw new Error("该接待还没有ASR任务ID，请先提交转写。");
    return getAliyunFileTranscriptionResult(session.asr_task_id);
  }
  throw new Error("该接待没有可查询的ASR任务。");
}
