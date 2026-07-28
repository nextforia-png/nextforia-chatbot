"use strict";

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const root = __dirname;
const failures = [];
const warnings = [];

function trackedFiles() {
  const result = childProcess.spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error("Unable to enumerate tracked files");
  return result.stdout.split("\0").filter(Boolean);
}

const files = trackedFiles();
const sourceFiles = files.filter(function (file) {
  return /\.js$/.test(file) && !/\.test\.js$/.test(file) && file !== "security-audit.js";
});
const secretRules = [
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws_access_key", /\bAKIA[0-9A-Z]{16}\b/],
  ["github_token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["meta_token", /\bEA[A-Za-z0-9]{30,}\b/]
];

for (const file of files) {
  const absolute = path.join(root, file);
  let content;
  try { content = fs.readFileSync(absolute, "utf8"); }
  catch (_) { continue; }
  for (const [name, pattern] of secretRules) {
    if (name === "meta_token" && /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(file)) continue;
    if (pattern.test(content)) failures.push(file + ": possible " + name + " committed");
  }
}

for (const file of sourceFiles) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) continue;
  const content = fs.readFileSync(absolute, "utf8");
  if (/req\.query\.key\b/.test(content)) failures.push(file + ": URL query authentication is forbidden");
  if (/if\s*\(\s*!\w*(?:SECRET|secret)\w*\s*\)\s*return\s+true/.test(content)) failures.push(file + ": security check appears to fail open");
  if (/process\.env\.(?:DASHBOARD_KEY|VERIFY_TOKEN|META_APP_SECRET)\s*\|\|\s*["'][^"']+["']/.test(content)) failures.push(file + ": sensitive environment variable has a hard-coded fallback");
}

for (const file of files) {
  if (/^\.env(?:\.|$)/.test(file) && file !== ".env.example") failures.push(file + ": environment file is tracked");
}
if (!fs.existsSync(path.join(root, "pnpm-lock.yaml"))) failures.push("pnpm-lock.yaml is missing");
if (!fs.existsSync(path.join(root, ".env.example"))) warnings.push(".env.example is missing");

const report = {
  ok: failures.length === 0,
  checked_at: new Date().toISOString(),
  tracked_files_checked: files.length,
  source_files_checked: sourceFiles.length,
  failures,
  warnings
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
