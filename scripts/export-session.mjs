#!/usr/bin/env node
// Export this Claude Code session's transcript into ./session-logs/ with a timestamp.
//
// WHERE CC KEEPS SESSION HISTORY:
//   ~/.claude/projects/<encoded-cwd>/<session-uuid>.jsonl
// where <encoded-cwd> is the launch directory's absolute path with "/" and "." → "-".
// For this repo that resolves to:  ~/.claude/projects/-Users-Laurie-Desktop-basis/
// Each file is a raw, UNREDACTED JSONL transcript — it may contain local paths or any
// secret pasted into the session. The copy lands in ./session-logs/, which is gitignored;
// SCRUB before anything goes into the public submission.
//
// Usage:
//   npm run export-session                 # newest (this active) session
//   node scripts/export-session.mjs --all  # every session for this project
//   node scripts/export-session.mjs --session <uuid>
//   node scripts/export-session.mjs --list # just show what's on disk, copy nothing

import { homedir } from "node:os";
import { mkdirSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(repoRoot, "session-logs");

// CC encodes the launch cwd by replacing "/" and "." with "-".
const encodedCwd = repoRoot.replace(/[/.]/g, "-");
const sessionDir = join(homedir(), ".claude", "projects", encodedCwd);

const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const listOnly = args.includes("--list");
const sIdx = args.findIndex((a) => a === "--session");
const sessionArg = sIdx !== -1 ? args[sIdx + 1] : args.find((a) => a.startsWith("--session="))?.split("=")[1];

function transcripts() {
  let names;
  try {
    names = readdirSync(sessionDir);
  } catch {
    console.error(`No session directory found at:\n  ${sessionDir}\n` +
      `(Claude Code creates it on first session in this repo.)`);
    process.exit(1);
  }
  const files = names
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => {
      const full = join(sessionDir, n);
      return { name: n, full, mtime: statSync(full).mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime); // oldest first; newest last
  if (files.length === 0) {
    console.error(`No .jsonl transcripts in:\n  ${sessionDir}`);
    process.exit(1);
  }
  return files;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const files = transcripts();

console.log(`source: ${sessionDir}`);
if (listOnly) {
  for (const f of files) {
    const tag = f === files[files.length - 1] ? "  <- newest (this active session)" : "";
    console.log(`  ${f.name}  (${(statSync(f.full).size / 1024).toFixed(0)} KB)${tag}`);
  }
  process.exit(0);
}

let selected;
if (sessionArg) {
  selected = files.filter((f) => f.name.startsWith(sessionArg));
  if (selected.length === 0) {
    console.error(`No transcript matching --session ${sessionArg} in ${sessionDir}`);
    process.exit(1);
  }
} else if (wantAll) {
  selected = files;
} else {
  selected = [files[files.length - 1]]; // newest mtime = the live session
}

mkdirSync(destDir, { recursive: true });
const ts = stamp();
for (const f of selected) {
  const dest = join(destDir, `${ts}__${f.name}`);
  copyFileSync(f.full, dest);
  console.log(`copied: ${f.name}  ->  session-logs/${basename(dest)}`);
}
console.log(`\n${selected.length} file(s) exported to ./session-logs/`);
console.log("NOTE: raw transcript — may contain the API key or local paths. SCRUB before any public submission.");
