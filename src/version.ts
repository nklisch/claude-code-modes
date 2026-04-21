import pkg from "../package.json" with { type: "json" };

/**
 * claude-mode's own version, sourced from package.json.
 *
 * Bun's bundler embeds JSON imports into the compiled binary, so this works
 * identically in dev (`bun run`) and in the compiled `claude-mode-bin`.
 */
export const VERSION: string = pkg.version;
