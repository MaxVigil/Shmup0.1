#!/usr/bin/env node
/**
 * V02-WI-04 C05 canonical evidence source fingerprint (Epic §20.1,
 * V02-AC-028; C05 delta 4/6).
 *
 * HEAD alone cannot identify evidence freshness while the worktree is dirty,
 * so every generated evidence record must carry a deterministic digest of the
 * actual current WI-04 build/test inputs in addition to the HEAD revision.
 * The digest is content-only (never mtime): FNV-1a 32-bit over each input
 * file's POSIX-relative path + content, files sorted by path. Generated
 * artifacts (dist/, dist-evidence/, dist-evidence-uninstrumented/,
 * node_modules/, .agent-handoff/evidence/, .agent-handoff/result.json) are
 * never inputs, so the digest is stable across the separate evidence
 * generation commands and npm ci/builds.
 *
 * This module is the single canonical implementation shared by the Pass A /
 * Pass B / legacy record writers (which receive the fingerprint through
 * `SHMUP_EVIDENCE_SOURCE_FINGERPRINT`) and the comparison validator (which
 * recomputes it from the current tree and rejects any mismatch).
 *
 * Usage: node scripts/evidence-source-fingerprint.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function walkDirectory(directory, files) {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walkDirectory(full, files);
    } else {
      files.push(full);
    }
  }
}

/** The exact WI-04 build/test/evidence input files that identify evidence
 *  freshness. Generated dirs and result.json are intentionally excluded. */
export function collectSourceInputFiles(root = ROOT) {
  const files = [];
  const addIfExists = (path) => {
    const full = join(root, path);
    if (existsSync(full)) {
      files.push(full);
    }
  };
  for (const file of [
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'vitest.config.ts',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'eslint.config.js',
    'playwright.config.ts',
    'playwright.evidence.config.ts',
    'playwright.legacy.config.ts',
    '.gitignore',
    '.agent-handoff/control.json',
    'scripts/compare-performance-evidence.mjs',
    'scripts/evidence-integrity.mutation.test.mjs',
    'scripts/evidence-source-fingerprint.mjs',
    'scripts/run-legacy-proxy.mjs',
  ]) {
    addIfExists(file);
  }
  // All source and all e2e specs: any change to build/test inputs must bump
  // the fingerprint so stale or foreign-tree records are rejected.
  for (const directory of ['src', 'e2e']) {
    if (existsSync(join(root, directory))) {
      walkDirectory(join(root, directory), files);
    }
  }
  return files;
}

/** Deterministic content digest of the current source tree plus the git HEAD.
 *  `git` runs in `root` (the base proxy copy never calls this; the runner
 *  injects the current-tree fingerprint there). */
export function computeSourceFingerprint(root = ROOT) {
  const files = collectSourceInputFiles(root).sort((a, b) =>
    relative(root, a).localeCompare(relative(root, b)),
  );
  let hash = FNV_OFFSET_BASIS;
  for (const file of files) {
    const rel = relative(root, file).split(sep).join('/');
    const content = readFileSync(file, 'utf8');
    // FNV-1a carries its 32-bit state across files: `\u0000` separates path and
    // content and the state never resets between files.
    for (let index = 0; index < rel.length; index += 1) {
      hash ^= rel.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME);
    }
    hash ^= 0;
    hash = Math.imul(hash, FNV_PRIME);
    for (let index = 0; index < content.length; index += 1) {
      hash ^= content.charCodeAt(index);
      hash = Math.imul(hash, FNV_PRIME);
    }
    hash = hash >>> 0;
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  return {
    head,
    digest: (hash >>> 0).toString(16).padStart(8, '0'),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(computeSourceFingerprint()));
}
