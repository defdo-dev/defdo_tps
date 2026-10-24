# defdo_tps

Generation telemetry (TPS / AVG / TTFT) for Defdo workstations, rendered in
the footer of coding CLIs. One repo, one adapter per CLI:

```text
◆ defdo.dev » TPS 9.34 t/s » AVG 9.34 t/s » TTFT 66.6s
```

| CLI | Adapter | Data source | Live streaming TPS |
| --- | --- | --- | --- |
| OpenCode | `opencode/tui.tsx` (TUI plugin, `prompt.footer.status` slot) | OpenCode 2 event stream (`session.text.delta`, `session.reasoning.delta`, `session.step.*`) | Yes (rolling 5s window) |
| Kimi Code | `kimi/statusline.ts` (`[status_line]` command) | Per-session `wire.jsonl` `step.end` events (server-side timings) | No — TPS = last completed step |

## Metrics

- `TPS`: OpenCode: rolling generation rate while streaming. Kimi: rate of the
  last completed step (`usage.output / llmServerDecodeMs`, server-side).
- `AVG`: completed-turn generation average for the session.
- `TTFT`: average time to first token for completed turns
  (Kimi: `llmFirstTokenLatencyMs`).
- `∅`: no value available yet; not zero throughput.

No provider tokens or credentials are stored. Kimi session data is read
read-only from `~/.kimi-code/sessions/`; parsed offsets are cached under
`$TMPDIR/defdo-tps-kimi/` so the status line only reads newly appended bytes
(kimi caps status-line runs at 300ms / 1x per second).

## Layout

```text
shared/format.ts     shared rate/TTFT formatting
opencode/            OpenCode TUI plugin (state.ts + tui.tsx)
kimi/                Kimi Code status line (tps.ts + statusline.ts)
```

## OpenCode install

OpenCode 2 (>= 2.1.4) discovers directory plugins under
`~/.config/opencode/plugins/` automatically. Keep a compatibility symlink at:

```bash
ln -s /path/to/defdo_tps/opencode ~/.config/opencode/plugins/defdo-tps-sidebar
```

The plugin resolves `@opencode/plugin/tui` at runtime; no config entry is
required. (OpenCode 1 used `tui.json` plus `@opencode-ai/plugin` — that
integration no longer exists.)

## Kimi Code install

```bash
bun run build:kimi   # compiles kimi/statusline.ts -> ~/.kimi-code/defdo-tps-statusline
```

Then in `~/.kimi-code/tui.toml`:

```toml
[status_line]
command = "~/.kimi-code/defdo-tps-statusline"
```

Apply with `/reload-tui`. The custom command replaces footer line 1, so the
adapter re-emits model/branch/plan prefix before the defdo block. Re-run
`bun run build:kimi` after code changes.

## Verification

```bash
bun install
bun test               # opencode + kimi unit tests
bun run verify:opencode
echo '{"model":"K3","cwd":"'$PWD'"}' | bun kimi/statusline.ts
```
