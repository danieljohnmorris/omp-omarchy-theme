import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as omp from "@oh-my-pi/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { buildOmpTheme, readOmarchyTheme, THEME_NAME } from "./omarchy";

/** Poll interval for Omarchy theme changes. Theme switches are rare; 2s is unnoticeable. */
const POLL_MS = 2_000;

interface SyncState {
  enabled: boolean;
  busy: boolean;
  /** Source path + theme name + raw colors.toml, to detect any change. */
  signature?: string;
}

const states = new Map<string, SyncState>();

function themesDir(): string {
  try {
    return omp.getCustomThemesDir();
  } catch {
    return join(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".omp", "agent"), "themes");
  }
}

async function applyOmarchyTheme(ctx: ExtensionContext): Promise<string> {
  const source = readOmarchyTheme();
  const theme = buildOmpTheme(source.colors, THEME_NAME);

  const dir = themesDir();
  mkdirSync(dir, { recursive: true });
  const themePath = join(dir, `${THEME_NAME}.json`);
  const tmpPath = `${themePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(theme, null, 2)}\n`);
  renameSync(tmpPath, themePath);

  if (typeof ctx.ui.setTheme !== "function") {
    throw new Error("theme switching is unavailable in this mode");
  }
  const result = await ctx.ui.setTheme(THEME_NAME);
  if (!result.success) {
    throw new Error(result.error ?? `could not switch to theme "${THEME_NAME}"`);
  }

  return source.name;
}

async function tick(
  pi: ExtensionAPI,
  state: SyncState,
  ctx: ExtensionContext,
  announce: boolean,
): Promise<void> {
  if (!state.enabled || state.busy) return;
  state.busy = true;
  try {
    const source = readOmarchyTheme();
    const signature = `${source.colorsPath}\0${source.name}\0${source.raw}`;
    if (signature === state.signature) return;

    const isFirstApply = state.signature === undefined;
    const name = await applyOmarchyTheme(ctx);
    state.signature = signature;

    if (announce || !isFirstApply) {
      ctx.ui.notify(`Omarchy theme ${isFirstApply ? "applied" : "updated"}: ${name}`, "info");
    }
  } catch (error) {
    pi.logger.debug(
      `omarchy-theme: ${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    state.busy = false;
  }
}

export default function omarchyTheme(pi: ExtensionAPI) {
  pi.setLabel("Omarchy Theme");

  pi.on("session_start", async (_event, ctx) => {
    // The generated theme is a TUI concern; headless/ACP sessions have no theme UI.
    if (ctx.mode !== "tui" || ctx.agent.kind !== "main") return;

    const state: SyncState = { enabled: true, busy: false };
    states.set(ctx.sessionManager.getSessionId(), state);

    await tick(pi, state, ctx, true);
    ctx.setInterval(() => {
      void tick(pi, state, ctx, false);
    }, POLL_MS);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    states.delete(ctx.sessionManager.getSessionId());
  });

  pi.registerCommand("omarchy-theme", {
    description: "Sync omp's theme with Omarchy (sync | status | off | on)",
    handler: async (args, ctx) => {
      const sessionId = ctx.sessionManager.getSessionId();
      let state = states.get(sessionId);
      if (!state) {
        state = { enabled: true, busy: false };
        states.set(sessionId, state);
      }

      const action = args.trim().toLowerCase();

      if (action === "off") {
        state.enabled = false;
        ctx.ui.notify("Omarchy theme sync paused for this session", "info");
        return;
      }

      if (action === "status") {
        try {
          const source = readOmarchyTheme();
          ctx.ui.notify(
            `Omarchy theme: ${source.name} (${source.colorsPath}); sync ${state.enabled ? "on" : "off"}`,
            "info",
          );
        } catch (error) {
          ctx.ui.notify(error instanceof Error ? error.message : String(error), "warning");
        }
        return;
      }

      if (action === "on") {
        state.enabled = true;
        await tick(pi, state, ctx, true);
        return;
      }

      if (action && action !== "sync") {
        ctx.ui.notify("Usage: /omarchy-theme [sync|status|off|on]", "warning");
        return;
      }

      state.enabled = true;
      state.signature = undefined; // Force re-apply even when colors.toml is unchanged.
      await tick(pi, state, ctx, true);
    },
  });
}
