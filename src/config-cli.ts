import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import {
  type UserConfig,
  readConfigFile,
  checkModifierNameCollision,
  checkPresetNameCollision,
  checkAxisValueCollision,
} from "./config.js";
const VALID_AXES = ["agency", "quality", "scope"] as const;
type ValidAxis = (typeof VALID_AXES)[number];

function getConfigPath(isGlobal: boolean): string {
  if (isGlobal) {
    return join(homedir(), ".config", "claude-mode", "config.json");
  }
  return join(process.cwd(), ".claude-mode.json");
}

function configFileName(configPath: string): string {
  // Return a user-friendly name for confirmation messages
  const home = homedir();
  if (configPath.startsWith(home)) {
    return "~" + configPath.slice(home.length);
  }
  return configPath.split("/").pop() ?? configPath;
}

function readConfig(configPath: string): UserConfig {
  if (!existsSync(configPath)) return {};
  return readConfigFile(configPath);
}

function writeConfig(configPath: string, config: UserConfig): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function configShow(configPath: string): void {
  if (!existsSync(configPath)) {
    process.stdout.write("No config file found.\n");
    return;
  }
  const text = readFileSync(configPath, "utf8");
  process.stdout.write(text.trimEnd() + "\n");
}

function configInit(configPath: string): void {
  if (existsSync(configPath)) {
    throw new Error(`Config file already exists: ${configPath}`);
  }
  const scaffold: UserConfig = {
    defaultModifiers: [],
    modifiers: {},
    axes: {},
    presets: {},
  };
  writeConfig(configPath, scaffold);
  process.stdout.write(`Created ${configFileName(configPath)}\n`);
}

function configAddDefault(configPath: string, value: string): void {
  const config = readConfig(configPath);
  const defaults = config.defaultModifiers ?? [];
  if (defaults.includes(value)) {
    process.stdout.write(
      `"${value}" is already in defaultModifiers in ${configFileName(configPath)}\n`
    );
    return;
  }
  config.defaultModifiers = [...defaults, value];
  writeConfig(configPath, config);
  process.stdout.write(
    `Added "${value}" to defaultModifiers in ${configFileName(configPath)}\n`
  );
}

function configRemoveDefault(configPath: string, value: string): void {
  const config = readConfig(configPath);
  const defaults = config.defaultModifiers ?? [];
  if (!defaults.includes(value)) {
    throw new Error(
      `"${value}" not found in defaultModifiers in ${configFileName(configPath)}`
    );
  }
  config.defaultModifiers = defaults.filter((v) => v !== value);
  writeConfig(configPath, config);
  process.stdout.write(
    `Removed "${value}" from defaultModifiers in ${configFileName(configPath)}\n`
  );
}

function configAddModifier(configPath: string, name: string, mdPath: string): void {
  checkModifierNameCollision(name);
  const config = readConfig(configPath);
  config.modifiers = { ...config.modifiers, [name]: mdPath };
  writeConfig(configPath, config);
  process.stdout.write(
    `Registered modifier "${name}" in ${configFileName(configPath)}\n`
  );
}

function configRemoveModifier(configPath: string, name: string): void {
  const config = readConfig(configPath);
  const modifiers = config.modifiers ?? {};
  if (!(name in modifiers)) {
    throw new Error(
      `Modifier "${name}" not found in ${configFileName(configPath)}`
    );
  }
  const updated = { ...modifiers };
  delete updated[name];
  config.modifiers = updated;
  writeConfig(configPath, config);
  process.stdout.write(
    `Unregistered modifier "${name}" from ${configFileName(configPath)}\n`
  );
}

function configAddAxis(configPath: string, axis: string, name: string, mdPath: string): void {
  if (!(VALID_AXES as readonly string[]).includes(axis)) {
    throw new Error(
      `Invalid axis "${axis}"; must be one of: ${VALID_AXES.join(", ")}`
    );
  }
  const validAxis = axis as ValidAxis;

  checkAxisValueCollision(validAxis, name);

  const config = readConfig(configPath);
  config.axes = config.axes ?? {};
  config.axes[validAxis] = { ...config.axes[validAxis], [name]: mdPath };
  writeConfig(configPath, config);
  process.stdout.write(
    `Registered ${axis} value "${name}" in ${configFileName(configPath)}\n`
  );
}

function configRemoveAxis(configPath: string, axis: string, name: string): void {
  if (!(VALID_AXES as readonly string[]).includes(axis)) {
    throw new Error(
      `Invalid axis "${axis}"; must be one of: ${VALID_AXES.join(", ")}`
    );
  }
  const validAxis = axis as ValidAxis;

  const config = readConfig(configPath);
  const axisMap = config.axes?.[validAxis] ?? {};
  if (!(name in axisMap)) {
    throw new Error(
      `${axis} value "${name}" not found in ${configFileName(configPath)}`
    );
  }
  const updated = { ...axisMap };
  delete updated[name];
  config.axes = config.axes ?? {};
  config.axes[validAxis] = updated;
  writeConfig(configPath, config);
  process.stdout.write(
    `Unregistered ${axis} value "${name}" from ${configFileName(configPath)}\n`
  );
}

function configAddPreset(configPath: string, name: string, flags: string[]): void {
  checkPresetNameCollision(name);

  const { values } = parseArgs({
    args: flags,
    options: {
      agency: { type: "string" },
      quality: { type: "string" },
      scope: { type: "string" },
      modifier: { type: "string", multiple: true },
      readonly: { type: "boolean" },
      "context-pacing": { type: "boolean" },
    },
    strict: true,
  });

  const presetDef: NonNullable<UserConfig["presets"]>[string] = {};
  if (values.agency !== undefined) presetDef.agency = values.agency;
  if (values.quality !== undefined) presetDef.quality = values.quality;
  if (values.scope !== undefined) presetDef.scope = values.scope;
  if (values.modifier !== undefined && values.modifier.length > 0) {
    presetDef.modifiers = values.modifier as string[];
  }
  if (values.readonly !== undefined) presetDef.readonly = values.readonly;
  if (values["context-pacing"] !== undefined) presetDef.contextPacing = values["context-pacing"];

  const config = readConfig(configPath);
  config.presets = { ...config.presets, [name]: presetDef };
  writeConfig(configPath, config);
  process.stdout.write(
    `Created preset "${name}" in ${configFileName(configPath)}\n`
  );
}

function configRemovePreset(configPath: string, name: string): void {
  const config = readConfig(configPath);
  const presets = config.presets ?? {};
  if (!(name in presets)) {
    throw new Error(
      `Preset "${name}" not found in ${configFileName(configPath)}`
    );
  }
  const updated = { ...presets };
  delete updated[name];
  config.presets = updated;
  writeConfig(configPath, config);
  process.stdout.write(
    `Removed preset "${name}" from ${configFileName(configPath)}\n`
  );
}

/**
 * Handles `claude-mode config <subcommand> [args] [--global]`.
 * Defaults to project-local (.claude-mode.json in CWD).
 * --global targets ~/.config/claude-mode/config.json.
 */
export function runConfigCommand(argv: string[]): void {
  // Extract --global flag
  const isGlobal = argv.includes("--global");
  const args = argv.filter((a) => a !== "--global");

  const configPath = getConfigPath(isGlobal);
  const [subcommand, ...rest] = args;

  if (!subcommand || subcommand === "help") {
    const usage = `Usage: claude-mode config <subcommand> [args] [--global]

Subcommands:
  show                              Print current config
  init                              Create .claude-mode.json scaffold
  add-default <name-or-path>        Add to defaultModifiers
  remove-default <name>             Remove from defaultModifiers
  add-modifier <name> <path>        Register a named modifier
  remove-modifier <name>            Unregister a named modifier
  add-axis <axis> <name> <path>     Register custom axis value
  remove-axis <axis> <name>         Unregister custom axis value
  add-preset <name> [flags]         Create a custom preset
  remove-preset <name>              Remove a custom preset

Flags for add-preset:
  --agency <value>
  --quality <value>
  --scope <value>
  --modifier <name> (repeatable)
  --readonly
  --context-pacing`;
    process.stdout.write(usage + "\n");
    return;
  }

  switch (subcommand) {
    case "show":
      configShow(configPath);
      break;

    case "init":
      configInit(configPath);
      break;

    case "add-default": {
      if (rest.length < 1) throw new Error("add-default requires <name-or-path>");
      configAddDefault(configPath, rest[0]);
      break;
    }

    case "remove-default": {
      if (rest.length < 1) throw new Error("remove-default requires <name>");
      configRemoveDefault(configPath, rest[0]);
      break;
    }

    case "add-modifier": {
      if (rest.length < 2) throw new Error("add-modifier requires <name> <path>");
      configAddModifier(configPath, rest[0], rest[1]);
      break;
    }

    case "remove-modifier": {
      if (rest.length < 1) throw new Error("remove-modifier requires <name>");
      configRemoveModifier(configPath, rest[0]);
      break;
    }

    case "add-axis": {
      if (rest.length < 3) throw new Error("add-axis requires <axis> <name> <path>");
      configAddAxis(configPath, rest[0], rest[1], rest[2]);
      break;
    }

    case "remove-axis": {
      if (rest.length < 2) throw new Error("remove-axis requires <axis> <name>");
      configRemoveAxis(configPath, rest[0], rest[1]);
      break;
    }

    case "add-preset": {
      if (rest.length < 1) throw new Error("add-preset requires <name>");
      const [presetName, ...presetFlags] = rest;
      configAddPreset(configPath, presetName, presetFlags);
      break;
    }

    case "remove-preset": {
      if (rest.length < 1) throw new Error("remove-preset requires <name>");
      configRemovePreset(configPath, rest[0]);
      break;
    }

    default:
      throw new Error(
        `Unknown config subcommand: "${subcommand}". Run "claude-mode config help" for usage.`
      );
  }
}
