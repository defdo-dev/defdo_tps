# defdo_opencode_tps

OpenCode TUI plugin that shows Defdo generation telemetry next to the
session usage footer:

```text
◆ defdo.dev » TPS 9.34 t/s » AVG 9.34 t/s » TTFT 66.6s
```

## What it measures

- `TPS`: live rolling generation rate while the model is streaming.
- `AVG`: completed assistant-turn generation average for the session.
- `TTFT`: average time to first response for completed turns.
- `∅`: no value is available yet; it does not mean zero throughput.

The plugin is intentionally host-integrated: OpenCode supplies the TUI slot,
theme, session state, and event stream. It does not store provider tokens or
other credentials.

## Local installation

The active workstation keeps a compatibility symlink at:

```text
~/.config/opencode/plugins/defdo-tps-sidebar
```

That symlink points to this project. `~/.config/opencode/tui.json` loads
`tui.tsx` through the existing local plugin entry.

## Verification

```bash
bun build tui.tsx \
  --target bun \
  --format esm \
  --external '@opentui/solid' \
  --external '@opencode-ai/plugin/tui' \
  --external 'solid-js' \
  --outfile /tmp/defdo-tps-sidebar.js
```
