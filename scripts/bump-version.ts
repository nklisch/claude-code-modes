#!/usr/bin/env bun
/**
 * Bumps version in package.json, commits, tags, and pushes.
 * The tag push triggers the release workflow.
 *
 * Usage: bun scripts/bump-version.ts <patch|minor|major|x.y.z>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "..");
const PKG_PATH = join(PROJECT_ROOT, "package.json");

const BUMP_TYPES = ["patch", "minor", "major"] as const;
type BumpType = (typeof BUMP_TYPES)[number];

// ---------------------------------------------------------------------------
// Version computation
// ---------------------------------------------------------------------------

function parseVersion(version: string): [number, number, number] {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Invalid version in package.json: "${version}"`);
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function bumpVersion(current: string, bump: BumpType | string): string {
  // Exact version specified
  if (/^\d+\.\d+\.\d+$/.test(bump)) return bump;

  if (!(BUMP_TYPES as readonly string[]).includes(bump)) {
    throw new Error(
      `Invalid bump type: "${bump}". Expected one of: ${BUMP_TYPES.join(", ")} or an exact version like "1.2.3"`
    );
  }

  const [major, minor, patch] = parseVersion(current);
  switch (bump as BumpType) {
    case "major": return `${major + 1}.0.0`;
    case "minor": return `${major}.${minor + 1}.0`;
    case "patch": return `${major}.${minor}.${patch + 1}`;
  }
}

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

function run(cmd: string): void {
  console.log(`  $ ${cmd}`);
  execSync(cmd, { cwd: PROJECT_ROOT, stdio: "inherit" });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const arg = process.argv[2];

if (!arg) {
  console.error("Usage: bun scripts/bump-version.ts <patch|minor|major|x.y.z>");
  process.exit(1);
}

try {
  const pkg = JSON.parse(readFileSync(PKG_PATH, "utf8"));
  const currentVersion: string = pkg.version;
  if (!currentVersion) throw new Error("No version field found in package.json");

  const nextVersion = bumpVersion(currentVersion, arg);
  const tag = `v${nextVersion}`;

  console.log(`Bumping ${currentVersion} → ${nextVersion}`);

  // Update package.json
  pkg.version = nextVersion;
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`Updated package.json to ${nextVersion}`);

  // Regenerate embedded prompts
  console.log("Regenerating embedded prompts...");
  run("bun scripts/generate-prompts.ts");

  // Stage all tracked changes + new generated files
  run("git add -u");
  run("git add package.json");

  // Commit
  run(`git commit -m "Release ${tag}"`);

  // Tag
  run(`git tag ${tag}`);

  // Push commit and tags
  run("git push");
  run("git push --tags");

  console.log(`Released ${tag}`);
} catch (err) {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
}
