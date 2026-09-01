import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", "node_modules", "dist", "data", "uploads", "outputs", ".tmp", "coverage"]);
const ignoredFiles = new Set([".env", ".DS_Store"]);
const checks = [
  ["阿里云 AccessKey", /LTAI[A-Za-z0-9]{12,}/],
  ["云服务 API Key", /\bsk-[A-Za-z0-9_-]{16,}\b/],
  ["私钥", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["疑似硬编码敏感变量", /(?:API_KEY|ACCESS_KEY_SECRET|CLIENT_SECRET|PASSWORD|AUTH_TOKEN)[\t ]*[:=][\t ]*["']?[A-Za-z0-9_./+=-]{12,}/]
];

function walk(directory) {
  const files = [];
  for (const name of readdirSync(directory)) {
    if (ignoredDirectories.has(name) || ignoredFiles.has(name)) continue;
    const path = join(directory, name);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (stat.isFile() && stat.size <= 5 * 1024 * 1024) files.push(path);
  }
  return files;
}

function candidateFiles() {
  if (existsSync(join(root, ".git"))) {
    const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
    return tracked.map((path) => join(root, path)).filter(existsSync);
  }
  return walk(root);
}

const failures = [];
if (existsSync(join(root, ".git"))) {
  const tracked = new Set(execFileSync("git", ["ls-files"], { cwd: root }).toString().split(/\r?\n/));
  if (tracked.has(".env")) failures.push({ file: ".env", type: "敏感环境文件被 Git 跟踪" });
}

for (const file of candidateFiles()) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const [type, pattern] of checks) {
    if (pattern.test(content)) failures.push({ file: relative(root, file), type });
  }
}

if (failures.length) {
  console.error("安全检查未通过：");
  for (const failure of failures) console.error(`- ${failure.file}: ${failure.type}`);
  process.exit(1);
}

console.log("安全检查通过：未在待提交文件中发现云密钥、私钥或疑似硬编码敏感变量。");
