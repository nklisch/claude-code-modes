import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parseCliArgs } from "./args.js";
import { loadConfig, resolveConfigPath, type LoadedConfig } from "./config.js";
import { resolveConfig } from "./resolve.js";
import { getFragmentOrder } from "./assemble.js";
import { detectEnv, buildTemplateVars } from "./env.js";
import type { TemplateVars } from "./types.js";

const PROVENANCE_VALUES = ["built-in", "config-defined", "cli-path"] as const;
type Provenance = (typeof PROVENANCE_VALUES)[number];

const WARNING_KINDS = ["outside-project", "non-md", "missing-file", "suspicious-path"] as const;
type WarningKind = (typeof WARNING_KINDS)[number];

interface FragmentEntry {
  index: number;
  path: string;
  resolvedPath: string;
  provenance: Provenance;
}

interface Warning {
  fragmentIndex: number;
  fragmentPath: string;
  kind: WarningKind;
  detail: string;
}

interface ConfigSource {
  loaded: boolean;
  path: string | null;
  scope: "project" | "global" | null;
}

interface InspectResult {
  configSource: ConfigSource;
  fragments: FragmentEntry[];
  fragmentContents: Map<number, string | null>;
  warnings: Warning[];
  templateVars: TemplateVars;
  verbose: boolean;
}

const SUSPICIOUS_PATTERN = /\.(ssh|env|gnupg|aws|kube|docker|pgpass)|\.npmrc|\.netrc|id_rsa|id_ed25519|id_ecdsa|credentials|secret|token|password|private/i;

/** Builds a Set of all absolute paths that config definitions could resolve to. */
function collectConfigDefinedPaths(loadedConfig: LoadedConfig | null): Set<string> {
  const paths = new Set<string>();
  if (!loadedConfig) return paths;

  const { config, configDir } = loadedConfig;

  // Modifier definitions
  if (config.modifiers) {
    for (const val of Object.values(config.modifiers)) {
      paths.add(resolveConfigPath(configDir, val));
    }
  }

  // Axis definitions
  if (config.axes) {
    for (const axisName of ["agency", "quality", "scope"] as const) {
      const axisMap = config.axes[axisName];
      if (axisMap) {
        for (const val of Object.values(axisMap)) {
          paths.add(resolveConfigPath(configDir, val));
        }
      }
    }
  }

  // Preset modifier lists
  if (config.presets) {
    for (const preset of Object.values(config.presets)) {
      if (preset.modifiers) {
        for (const mod of preset.modifiers) {
          // Modifier names resolve through config.modifiers; raw paths resolve against configDir
          if (config.modifiers && mod in config.modifiers) {
            paths.add(resolveConfigPath(configDir, config.modifiers[mod]));
          }
        }
      }
    }
  }

  // defaultModifiers
  if (config.defaultModifiers) {
    for (const mod of config.defaultModifiers) {
      if (config.modifiers && mod in config.modifiers) {
        paths.add(resolveConfigPath(configDir, config.modifiers[mod]));
      }
    }
  }

  return paths;
}

/** Classifies a single fragment path as built-in, config-defined, or cli-path. */
function classifyProvenance(
  fragPath: string,
  configDefinedPaths: Set<string>,
): Provenance {
  if (!isAbsolute(fragPath)) return "built-in";
  if (configDefinedPaths.has(fragPath)) return "config-defined";
  return "cli-path";
}

/** Detects warnings for the fragment manifest. */
function detectWarnings(
  fragments: FragmentEntry[],
  promptsDir: string,
): Warning[] {
  const warnings: Warning[] = [];
  const cwd = process.cwd();
  const resolvedPromptsDir = resolve(promptsDir);

  for (const frag of fragments) {
    if (frag.provenance === "built-in") {
      // Only check existence for built-in fragments
      if (!existsSync(frag.resolvedPath)) {
        warnings.push({
          fragmentIndex: frag.index,
          fragmentPath: frag.path,
          kind: "missing-file",
          detail: `file not found: ${frag.resolvedPath}`,
        });
      }
      continue;
    }

    // Custom fragments: check all warning types
    // Use cwd + "/" to prevent prefix attacks (e.g. /project-evil matching /project)
    const inProject = frag.resolvedPath === cwd || frag.resolvedPath.startsWith(cwd + "/");
    const inPrompts = frag.resolvedPath === resolvedPromptsDir || frag.resolvedPath.startsWith(resolvedPromptsDir + "/");
    if (!inProject && !inPrompts) {
      warnings.push({
        fragmentIndex: frag.index,
        fragmentPath: frag.resolvedPath,
        kind: "outside-project",
        detail: `resolves outside project directory`,
      });
    }

    if (!frag.resolvedPath.endsWith(".md")) {
      warnings.push({
        fragmentIndex: frag.index,
        fragmentPath: frag.resolvedPath,
        kind: "non-md",
        detail: `non-.md extension`,
      });
    }

    if (!existsSync(frag.resolvedPath)) {
      warnings.push({
        fragmentIndex: frag.index,
        fragmentPath: frag.resolvedPath,
        kind: "missing-file",
        detail: `file not found`,
      });
    }

    if (SUSPICIOUS_PATTERN.test(frag.resolvedPath)) {
      warnings.push({
        fragmentIndex: frag.index,
        fragmentPath: frag.resolvedPath,
        kind: "suspicious-path",
        detail: `references potentially sensitive path`,
      });
    }
  }

  return warnings;
}

/** Determines config source info from LoadedConfig. */
function describeConfigSource(loadedConfig: LoadedConfig | null): ConfigSource {
  if (!loadedConfig) return { loaded: false, path: null, scope: null };

  const { configDir } = loadedConfig;
  const cwd = process.cwd();

  if (configDir === cwd) {
    return { loaded: true, path: resolve(configDir, ".claude-mode.json"), scope: "project" };
  }
  return { loaded: true, path: resolve(configDir, "config.json"), scope: "global" };
}

/** Formats an InspectResult as a human-readable string. */
function formatInspectOutput(result: InspectResult): string {
  const lines: string[] = [];

  // Warning banner — top of output when warnings exist
  if (result.warnings.length > 0) {
    const count = result.warnings.length;
    lines.push(`!! ${count} warning${count > 1 ? "s" : ""} found -- review before running`);
    lines.push("");
  }

  // Config section
  lines.push("=== Config ===");
  if (!result.configSource.loaded) {
    lines.push("No config file found.");
  } else {
    const label = result.configSource.scope === "project"
      ? ".claude-mode.json (project)"
      : "config.json (global)";
    lines.push(`Loaded: ${label}`);
    lines.push(`  Path: ${result.configSource.path}`);
  }
  lines.push("");

  // Warnings section — before fragments so issues surface early
  lines.push("=== Warnings ===");
  if (result.warnings.length === 0) {
    lines.push("(none)");
  } else {
    for (const w of result.warnings) {
      lines.push(`[!] #${w.fragmentIndex} ${w.detail}: ${w.fragmentPath}`);
    }
  }
  lines.push("");

  // Fragments section
  lines.push("=== Fragments ===");
  if (result.verbose) {
    for (const frag of result.fragments) {
      const displayPath = frag.provenance === "built-in" ? frag.path : frag.resolvedPath;
      lines.push("");
      lines.push(`--- #${frag.index} [${frag.provenance}] ${displayPath} ---`);
      const content = result.fragmentContents.get(frag.index);
      if (content === null || content === undefined) {
        lines.push("(file not found)");
      } else {
        lines.push(content.trim());
      }
    }
  } else {
    const indexWidth = String(result.fragments.length).length;
    lines.push(`${" ".repeat(indexWidth + 1)} Provenance       Path`);
    for (const frag of result.fragments) {
      const idx = String(frag.index).padStart(indexWidth);
      const prov = frag.provenance.padEnd(16);
      const displayPath = frag.provenance === "built-in" ? frag.path : frag.resolvedPath;
      lines.push(`${idx}  ${prov} ${displayPath}`);
    }
  }
  lines.push("");

  // Template variables section
  lines.push("=== Template Variables ===");
  const maxKeyLen = Math.max(...Object.keys(result.templateVars).map((k) => k.length));
  for (const [key, value] of Object.entries(result.templateVars)) {
    const displayValue = value.includes("\n") ? "(multiline)" : value;
    lines.push(`${key.padEnd(maxKeyLen)} = ${displayValue}`);
  }

  return lines.join("\n") + "\n";
}

/** Reads a fragment file, returning its content or null if missing. */
function readFragmentContent(resolvedPath: string): string | null {
  try {
    return readFileSync(resolvedPath, "utf8");
  } catch {
    return null;
  }
}

/** Runs the inspect subcommand. Accepts argv after "inspect" has been stripped. */
export function runInspectCommand(argv: string[], promptsDir: string): void {
  const verbose = argv.includes("--print");
  const filteredArgv = argv.filter((a) => a !== "--print");

  const parsed = parseCliArgs(filteredArgv);
  const loadedConfig = loadConfig();
  const config = resolveConfig(parsed, loadedConfig);

  const env = detectEnv();
  const templateVars = buildTemplateVars(env);

  const fragmentPaths = getFragmentOrder(config);
  const configDefinedPaths = collectConfigDefinedPaths(loadedConfig);

  const fragments: FragmentEntry[] = fragmentPaths.map((fragPath, i) => {
    const resolvedPath = isAbsolute(fragPath)
      ? fragPath
      : resolve(promptsDir, fragPath);
    return {
      index: i + 1,
      path: fragPath,
      resolvedPath,
      provenance: classifyProvenance(fragPath, configDefinedPaths),
    };
  });

  const fragmentContents = new Map<number, string | null>();
  if (verbose) {
    for (const frag of fragments) {
      fragmentContents.set(frag.index, readFragmentContent(frag.resolvedPath));
    }
  }

  const warnings = detectWarnings(fragments, promptsDir);
  const configSource = describeConfigSource(loadedConfig);

  const result: InspectResult = { configSource, fragments, fragmentContents, warnings, templateVars, verbose };
  process.stdout.write(formatInspectOutput(result));
}
