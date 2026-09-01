import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { env } from "../env.js";

export function getOssConfig() {
  const region = env("ALIYUN_OSS_REGION", env("ALIYUN_REGION", "cn-beijing"));
  const bucket = env("ALIYUN_OSS_BUCKET");
  const endpoint = env("ALIYUN_OSS_ENDPOINT", `https://${bucket}.oss-${region}.aliyuncs.com`);
  return {
    bucket,
    region,
    endpoint: endpoint.replace(/\/$/, ""),
    accessKeyId: env("ALIYUN_ACCESS_KEY_ID"),
    accessKeySecret: env("ALIYUN_ACCESS_KEY_SECRET"),
    prefix: env("ALIYUN_OSS_PREFIX", "uploads")
  };
}

export function getOssConfigStatus() {
  const config = getOssConfig();
  const missing = [];
  if (!config.bucket) missing.push("ALIYUN_OSS_BUCKET");
  if (!config.region) missing.push("ALIYUN_OSS_REGION");
  if (!config.accessKeyId) missing.push("ALIYUN_ACCESS_KEY_ID");
  if (!config.accessKeySecret) missing.push("ALIYUN_ACCESS_KEY_SECRET");
  return {
    configured: missing.length === 0,
    missing,
    bucket: config.bucket,
    region: config.region,
    endpoint: config.endpoint,
    prefix: config.prefix
  };
}

export async function uploadToOssAndGetSignedUrl(filePath) {
  const config = getOssConfig();
  const status = getOssConfigStatus();
  if (!status.configured) {
    throw new Error(`OSS配置不完整：${status.missing.join("、")}`);
  }
  const bytes = readFileSync(filePath);
  const detected = detectAudioType(bytes, filePath);
  const objectKey = `${config.prefix.replace(/^\/|\/$/g, "")}/${Date.now()}-${normalizeObjectName(filePath, detected.ext)}`;
  const contentType = detected.contentType;
  const date = new Date().toUTCString();
  const resource = `/${config.bucket}/${objectKey}`;
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${resource}`;
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  const putUrl = `${config.endpoint}/${encodeObjectKey(objectKey)}`;

  const response = await fetch(putUrl, {
    method: "PUT",
    headers: {
      Date: date,
      "Content-Type": contentType,
      Authorization: `OSS ${config.accessKeyId}:${signature}`
    },
    body: bytes
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`上传OSS失败：${response.status} ${body.slice(0, 200)}`);
  }

  return signOssGetUrl(config, objectKey);
}

function signOssGetUrl(config, objectKey) {
  const expires = Math.floor(Date.now() / 1000) + 3600 * 6;
  const resource = `/${config.bucket}/${objectKey}`;
  const stringToSign = `GET\n\n\n${expires}\n${resource}`;
  const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
  const params = new URLSearchParams({
    OSSAccessKeyId: config.accessKeyId,
    Expires: String(expires),
    Signature: signature
  });
  return `${config.endpoint}/${encodeObjectKey(objectKey)}?${params.toString()}`;
}

function encodeObjectKey(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function detectAudioType(bytes, filePath) {
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WAVE") {
    return { ext: ".wav", contentType: "audio/wav" };
  }
  if (bytes.subarray(0, 3).toString("ascii") === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { ext: ".mp3", contentType: "audio/mpeg" };
  }
  const ext = extname(filePath);
  return { ext, contentType: contentTypeFromExt(ext) };
}

function normalizeObjectName(filePath, ext) {
  const name = basename(filePath).replace(/\.[^.]+$/, "");
  return `${name}${ext || extname(filePath) || ""}`;
}

function contentTypeFromExt(ext) {
  const lower = ext.toLowerCase();
  if (lower === ".wav") return "audio/wav";
  if (lower === ".mp3") return "audio/mpeg";
  if (lower === ".m4a") return "audio/mp4";
  if (lower === ".aac") return "audio/aac";
  return "application/octet-stream";
}
