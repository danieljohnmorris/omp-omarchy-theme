# omp-omarchy-theme

An [omp](https://github.com/can1357/oh-my-pi) plugin that themes omp's TUI with the
colors of the current [Omarchy](https://omarchy.org) theme — and follows live theme
switches.

On session start the plugin reads Omarchy's applied `colors.toml`, maps it onto omp's
theme tokens, writes `~/.omp/agent/themes/omarchy.json`, and switches omp to it. While
the session runs it polls the applied theme every two seconds and re-applies when the
theme name or colors change, so `omarchy theme set …` is reflected without restarting
omp.

## Install

From the marketplace:

```bash
omp plugin marketplace add dan/omp-omarchy-theme
omp plugin install omarchy-theme@omp-omarchy-theme
```

From a local checkout:

```bash
omp plugin link /path/to/omp-omarchy-theme/plugins/omarchy-theme
```

Restart omp after installing: extension modules load at startup.

## Commands

| Command | Effect |
| --- | --- |
| `/omarchy-theme` or `/omarchy-theme sync` | Re-read Omarchy now and apply |
| `/omarchy-theme status` | Show the detected theme name and `colors.toml` path |
| `/omarchy-theme off` | Pause syncing for this session |
| `/omarchy-theme on` | Resume syncing and apply now |

## Theme source

Checked in order:

1. `$OMP_OMARCHY_THEME_DIR/colors.toml`
2. `$XDG_STATE_HOME/omarchy/current/theme/colors.toml` (default
   `~/.local/state/omarchy/current/theme/colors.toml`) — Omarchy v4
3. `$XDG_CONFIG_HOME/omarchy/current/theme/colors.toml` — older Omarchy
4. `$XDG_CONFIG_HOME/omarchy/current/colors.toml`

The current Omarchy key set and legacy `color0`–`color15` themes are both supported.
Missing optional colors (`orange`, `brown`, `selection`, `dark_*`) fall back to shades
blended from `background` and `foreground`.

## Notes

- TUI only. Print, RPC, and ACP sessions have no theme surface.
- The generated theme is named `omarchy`. It is not persisted to `config.yml`, so
  omp's configured dark/light themes stay untouched and return on the next start after
  the plugin is removed.
- The theme file is written atomically (temp file plus rename) and applied through
  `ctx.ui.setTheme("omarchy")`, which also arms omp's theme file watcher.
- Tested on omp 18.12.1.

## License

MIT
