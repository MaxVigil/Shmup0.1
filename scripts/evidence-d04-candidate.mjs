#!/usr/bin/env node
/**
 * V02-WI-07 D04-C01 candidate identity (correction delta 4).
 *
 * HEAD alone plus a dirty flag cannot identify the uncommitted D04 candidate, so
 * every D04 production evidence record and both Elite capture manifests carry:
 *
 * - the full HEAD revision;
 * - the canonical source fingerprint (`scripts/evidence-source-fingerprint.mjs`);
 * - this D04 candidate digest: FNV-1a 32-bit over every working-tree entry
 *   reported by `git status --porcelain=v1 -z --untracked-files=all` (POSIX
 *   relative path + raw file bytes, sorted by path) followed by the full HEAD
 *   revision;
 * - the ordinary build identifier emitted by the served artifact.
 *
 * `parsePorcelainPaths` and `computeCandidateDigest` are pure and unit-tested;
 * `collectCandidateFiles`/`computeD04CandidateIdentity` are the only IO.
 *
 * Usage: node scripts/evidence-d04-candidate.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export const D04_CANDIDATE_DIGEST_METHOD =
  'fnv1a32 over sorted `git status --porcelain=v1 -z --untracked-files=all` entries (POSIX path + raw file bytes) then the full HEAD revision';

/** Parses NUL-separated porcelain v1 output into sorted POSIX-relative paths. */
export function parsePorcelainPaths(output) {
  const chunks = String(output)
    .split('\0')
    .filter((chunk) => chunk.length > 0);
  const paths = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const status = chunk.slice(0, 2);
    const path = chunk.slice(3);
    if (path.length === 0) {
      continue;
    }
    paths.push(path);
    if (status.includes('R') || status.includes('C')) {
      // A rename/copy record carries the original path as the next chunk.
      index += 1;
    }
  }
  return paths.sort();
}

/** Deterministic digest of the candidate entries plus the HEAD revision. */
export function computeCandidateDigest({ head, files }) {
  if (typeof head !== 'string' || head.length === 0) {
    throw new Error('candidate digest requires a HEAD revision.');
  }
  const sorted = [...(files ?? [])].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  let hash = FNV_OFFSET_BASIS;
  const mix = (byte) => {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  };
  for (const file of sorted) {
    const pathBytes = Buffer.from(String(file.path), 'utf8');
    const contentBytes =
      typeof file.content === 'string'
        ? Buffer.from(file.content, 'utf8')
        : Buffer.from(file.content ?? []);
    for (const byte of pathBytes) {
      mix(byte);
    }
    mix(0);
    for (const byte of contentBytes) {
      mix(byte);
    }
    mix(0);
  }
  for (const byte of Buffer.from(head, 'utf8')) {
    mix(byte);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Reads every working-tree entry reported by git status (content-only). */
export function collectCandidateFiles(root = process.cwd()) {
  const output = execFileSync(
    'git',
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  const paths = parsePorcelainPaths(output);
  const files = [];
  for (const path of paths) {
    const full = join(root, path);
    if (!existsSync(full) || statSync(full).isDirectory()) {
      continue;
    }
    files.push({ path, content: readFileSync(full) });
  }
  return { paths, files };
}

/** The complete D04 candidate identity recorded by every D04 evidence record. */
export function computeD04CandidateIdentity(root = process.cwd()) {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const { files, paths } = collectCandidateFiles(root);
  return {
    head,
    digest: computeCandidateDigest({ head, files }),
    method: D04_CANDIDATE_DIGEST_METHOD,
    workingTreePaths: paths,
  };
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1]
) {
  console.log(JSON.stringify(computeD04CandidateIdentity(), null, 2));
}
