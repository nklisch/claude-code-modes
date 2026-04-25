import pkg from "../package.json" with { type: "json" };
import { BUILD_INFO, type BuildInfo } from "./build-info.js";

/**
 * claude-mode's own version, sourced from package.json.
 *
 * Bun's bundler embeds JSON imports into the compiled binary, so this works
 * identically in dev (`bun run`) and in the compiled `claude-mode-bin`.
 */
export const VERSION: string = pkg.version;

/**
 * Format the full version output for `--version`. Multi-line when build
 * provenance is available (forks, dev builds), single-line for release
 * builds where no git context is embedded.
 *
 * The point: a binary built from a fork should be unmistakably identifiable.
 *
 * @param info - Build provenance to format. Defaults to the embedded BUILD_INFO
 *   captured at compile time. Accepts an override for unit testing.
 */
export function formatVersion(info: BuildInfo = BUILD_INFO): string {
  const lines = [`claude-mode ${VERSION}`];

  if (info.repo) {
    lines.push(`  repo:   ${info.repo}`);
  }
  if (info.branch) {
    lines.push(`  branch: ${info.branch}`);
  }
  if (info.commit) {
    const commitSuffix = info.dirty ? " (dirty)" : "";
    lines.push(`  commit: ${info.commit}${commitSuffix}`);
  }

  return lines.join("\n");
}
