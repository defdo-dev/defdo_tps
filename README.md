# defdo_tps

Generation telemetry (TPS / AVG / TTFT) for Defdo workstations, rendered in
the footer of coding CLIs. One repo, one adapter per CLI:

## 🖥️ PI Extension

Muestra métricas de generación en tiempo real en la interfaz de PI:

```text
┌────────────────────────────────────────┐
│ 📊 TPS Metrics                         │
│ ● TPS: 45.23                           │
│ ◦ AVG: 45.00                           │
│ ○ TTFT: 185.4ms                        │
│ Session: 12.3s • Refresh: 1s           │
│ • Show detailed stats: q | Hide: esc   │
└────────────────────────────────────────┘
```

**Características:**
- Widget persistente con métricas en tiempo real
- Overlay de estadísticas detalladas (tecla `q`)
- Actualización automática cada segundo
- Simulación de métricas realistas para demostración

**Instalación:**
```bash
# Compilar el extension para PI
bun run build:pi

# Copiar el archivo compilado a tu directorio de extensiones de PI
# (ubicación depende de tu configuración de PI)
cp build/pi-extension.js ~/.local/share/pi/extensions/tps-extension.js

# O importarlo directamente desde el repo
bun add -p /Users/paridin/Devel/defdo_projects/defdo_tps
```

**Uso:**
- El widget se muestra automáticamente al iniciar una sesión
- Presiona `esc` para ocultar el widget
- Presiona `q` para reiniciar el auto-update
- Presiona `q` en el overlay para ver estadísticas en tiempo real

See more below.

```text
◆ defdo.dev » TPS 9.34 t/s » AVG 9.34 t/s » TTFT 66.6s
```

| CLI | Adapter | Data source | Live streaming TPS |
| --- | --- | --- | --- |
| OpenCode | `opencode/tui.tsx` (TUI plugin, `session_prompt_right` slot) | OpenCode event stream (`message.part.delta`, `message.updated`) | Yes (rolling 5s window) |
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

Point `~/.config/opencode/tui.json` at the local plugin (or keep the
published `oc-tps` entry):

```json
{ "plugin": ["file:///path/to/defdo_tps/opencode"] }
```

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
bun test               # opencode + kimi unit tests
bun run verify:opencode
echo '{"model":"K3","cwd":"'$PWD'"}' | bun kimi/statusline.ts
```
