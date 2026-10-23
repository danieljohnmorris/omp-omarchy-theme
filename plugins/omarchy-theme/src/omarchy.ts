import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Name omp uses for the generated custom theme (and its `<name>.json` file). */
export const THEME_NAME = "omarchy";

export type OmarchyColors = Record<string, string>;

export interface OmarchyThemeSource {
  /** Human-readable name from Omarchy's `theme.name`, when present. */
  name: string;
  colorsPath: string;
  raw: string;
  colors: OmarchyColors;
}

export interface OmpThemeJson {
  name: string;
  colors: Record<string, string>;
  export: { pageBg: string; cardBg: string; infoBg: string };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

function isHex(value: string | undefined): value is string {
  return typeof value === "string" && HEX.test(value);
}

type Env = Record<string, string | undefined>;

/**
 * Candidate `colors.toml` locations, most specific first.
 *
 * Omarchy v4 writes the applied theme to `$XDG_STATE_HOME/omarchy/current/theme`.
 * Older releases kept it under `$XDG_CONFIG_HOME/omarchy/current`.
 * `OMP_OMARCHY_THEME_DIR` points at a directory holding `colors.toml` directly.
 */
export function themeSourceCandidates(env: Env = process.env): string[] {
  const candidates: string[] = [];

  const override = env.OMP_OMARCHY_THEME_DIR;
  if (override) candidates.push(join(override, "colors.toml"));

  const stateHome = env.XDG_STATE_HOME?.startsWith("/")
    ? env.XDG_STATE_HOME
    : join(homedir(), ".local", "state");
  candidates.push(join(stateHome, "omarchy", "current", "theme", "colors.toml"));

  const configHome = env.XDG_CONFIG_HOME?.startsWith("/")
    ? env.XDG_CONFIG_HOME
    : join(homedir(), ".config");
  candidates.push(join(configHome, "omarchy", "current", "theme", "colors.toml"));
  candidates.push(join(configHome, "omarchy", "current", "colors.toml"));

  return candidates;
}

/**
 * Parse the flat `key = "value"` TOML Omarchy emits for `colors.toml`.
 *
 * Only top-level scalars matter here; section headers are ignored, and `#` is
 * treated as a comment only at the start of a line because hex values begin
 * with `#`.
 */
export function parseColorsToml(text: string): OmarchyColors {
  const colors: OmarchyColors = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("[")) continue;

    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(key)) continue;

    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    colors[key] = value;
  }
  return colors;
}

function readThemeName(colorsPath: string): string {
  const themeDir = dirname(colorsPath);
  const currentDir = dirname(themeDir);
  for (const path of [join(currentDir, "theme.name"), join(themeDir, "theme.name")]) {
    try {
      const name = readFileSync(path, "utf8").trim();
      if (name) return name;
    } catch {
      // Optional: fall through to the directory name.
    }
  }
  return basename(themeDir);
}

/** Read the currently applied Omarchy theme, or throw when none can be found. */
export function readOmarchyTheme(env: Env = process.env): OmarchyThemeSource {
  const tried: string[] = [];
  for (const colorsPath of themeSourceCandidates(env)) {
    tried.push(colorsPath);

    let raw: string;
    try {
      raw = readFileSync(colorsPath, "utf8");
    } catch {
      continue;
    }

    const colors = parseColorsToml(raw);
    if (!isHex(colors.background) || !isHex(colors.foreground)) continue;

    return { name: readThemeName(colorsPath), colorsPath, raw, colors };
  }

  throw new Error(`No Omarchy theme found; looked for colors.toml at ${tried.join(", ")}`);
}

function toHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[r, g, b].map((n) => clamp(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Linear mix of two hex colors; `amount` 0 keeps `from`, 1 returns `to`. */
export function blend(from: string, to: string, amount: number): string {
  const channel = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  const t = Math.max(0, Math.min(1, amount));
  return toHex(
    channel(from, 1) + (channel(to, 1) - channel(from, 1)) * t,
    channel(from, 3) + (channel(to, 3) - channel(from, 3)) * t,
    channel(from, 5) + (channel(to, 5) - channel(from, 5)) * t,
  );
}

function firstHex(colors: OmarchyColors, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = colors[key];
    if (isHex(value)) return value;
  }
  return undefined;
}

/**
 * Every token omp's custom-theme schema requires. `assistantMessageText` and
 * `thinkingMax` are optional upstream, but this generator always sets them.
 */
export const REQUIRED_COLOR_TOKENS = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "customMessageBg",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "statusLineBg",
  "userMessageText",
  "customMessageText",
  "customMessageLabel",
  "toolTitle",
  "toolOutput",
  "assistantMessageText",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "thinkingMax",
  "bashMode",
  "pythonMode",
  "statusLineSep",
  "statusLineModel",
  "statusLinePath",
  "statusLineGitClean",
  "statusLineGitDirty",
  "statusLineContext",
  "statusLineSpend",
  "statusLineStaged",
  "statusLineDirty",
  "statusLineUntracked",
  "statusLineOutput",
  "statusLineCost",
  "statusLineSubagents",
] as const;

/**
 * Map an Omarchy palette onto omp's theme tokens.
 *
 * Handles the Omarchy v4 key set and the older `color0..color15` set. Derived
 * shades are blended from `background`/`foreground` so every supported theme
 * yields readable blocks without per-theme hand tuning.
 */
export function buildOmpTheme(colors: OmarchyColors, name = THEME_NAME): OmpThemeJson {
  const background = firstHex(colors, "background");
  const foreground = firstHex(colors, "foreground");
  if (!background || !foreground) {
    throw new Error("colors.toml must define hex `background` and `foreground`");
  }

  const darkBackground = firstHex(colors, "dark_background") ?? background;
  const darkerBackground = firstHex(colors, "darker_background") ?? darkBackground;
  const lighterBackground =
    firstHex(colors, "lighter_background") ?? blend(background, foreground, 0.08);
  const darkForeground = firstHex(colors, "dark_foreground") ?? blend(foreground, background, 0.35);
  const brightForeground = firstHex(colors, "bright_foreground", "light_foreground") ?? foreground;

  const muted = firstHex(colors, "muted", "color8") ?? darkForeground;
  const accent = firstHex(colors, "accent", "blue", "color4") ?? foreground;
  const selection =
    firstHex(colors, "selection", "selection_background") ?? blend(background, foreground, 0.12);

  const red = firstHex(colors, "red", "color1") ?? "#d75f5f";
  const green = firstHex(colors, "green", "color2") ?? "#5faf5f";
  const yellow = firstHex(colors, "yellow", "color3") ?? "#d7af5f";
  const orange = firstHex(colors, "orange", "brown") ?? yellow;
  const blue = firstHex(colors, "blue", "color4") ?? accent;
  const magenta = firstHex(colors, "magenta", "color5") ?? "#af87d7";
  const cyan = firstHex(colors, "cyan", "color6") ?? "#5fafaf";

  const brightRed = firstHex(colors, "bright_red", "color9") ?? red;
  const brightYellow = firstHex(colors, "bright_yellow", "color11") ?? yellow;
  const brightGreen = firstHex(colors, "bright_green", "color10") ?? green;
  const brightCyan = firstHex(colors, "bright_cyan", "color14") ?? cyan;
  const brightBlue = firstHex(colors, "bright_blue", "color12") ?? blue;
  const brightMagenta = firstHex(colors, "bright_magenta", "color13") ?? magenta;

  const themeColors: Record<string, string> = {
    accent,
    border: selection,
    borderAccent: accent,
    borderMuted: blend(background, muted, 0.5),
    success: green,
    error: red,
    warning: orange,
    muted,
    dim: darkForeground,
    text: foreground,
    thinkingText: muted,

    selectedBg: selection,
    userMessageBg: lighterBackground,
    customMessageBg: darkBackground,
    toolPendingBg: darkBackground,
    toolSuccessBg: blend(background, green, 0.16),
    toolErrorBg: blend(background, red, 0.16),
    statusLineBg: darkerBackground,

    userMessageText: foreground,
    customMessageText: foreground,
    customMessageLabel: accent,
    toolTitle: foreground,
    toolOutput: darkForeground,
    assistantMessageText: foreground,

    mdHeading: accent,
    mdLink: blue,
    mdLinkUrl: muted,
    mdCode: brightForeground,
    mdCodeBlock: foreground,
    mdCodeBlockBorder: muted,
    mdQuote: darkForeground,
    mdQuoteBorder: selection,
    mdHr: selection,
    mdListBullet: accent,

    toolDiffAdded: green,
    toolDiffRemoved: red,
    toolDiffContext: muted,

    syntaxComment: muted,
    syntaxKeyword: magenta,
    syntaxFunction: blue,
    syntaxVariable: foreground,
    syntaxString: green,
    syntaxNumber: orange,
    syntaxType: cyan,
    syntaxOperator: accent,
    syntaxPunctuation: darkForeground,

    thinkingOff: muted,
    thinkingMinimal: darkForeground,
    thinkingLow: blue,
    thinkingMedium: cyan,
    thinkingHigh: magenta,
    thinkingXhigh: red,
    thinkingMax: brightRed,

    bashMode: cyan,
    pythonMode: magenta,

    statusLineSep: muted,
    statusLineModel: brightMagenta,
    statusLinePath: blue,
    statusLineGitClean: green,
    statusLineGitDirty: yellow,
    statusLineContext: cyan,
    statusLineSpend: brightCyan,
    statusLineStaged: green,
    statusLineDirty: yellow,
    statusLineUntracked: red,
    statusLineOutput: foreground,
    statusLineCost: orange,
    statusLineSubagents: magenta,
  };

  for (const token of REQUIRED_COLOR_TOKENS) {
    const value = themeColors[token];
    if (!isHex(value)) throw new Error(`generated theme is missing a valid \`${token}\` color`);
  }

  return {
    name,
    colors: themeColors,
    export: {
      pageBg: background,
      cardBg: darkBackground,
      infoBg: lighterBackground,
    },
  };
}
