import { expect, test } from "bun:test"
import {
  accumulateStep,
  averageTps,
  averageTtftMs,
  buildStatusLine,
  createSessionStats,
  parseStepEndLine,
} from "./tps"

const STEP_END_LINE = JSON.stringify({
  type: "context.append_loop_event",
  event: {
    type: "step.end",
    uuid: "cb4c9794-217f-44ca-b1ec-ff8529f067ae",
    turnId: "0",
    step: 1,
    finishReason: "tool_use",
    usage: { inputOther: 5347, output: 482, inputCacheRead: 19200, inputCacheCreation: 0 },
    llmFirstTokenLatencyMs: 39672,
    llmStreamDurationMs: 9315,
    llmServerFirstTokenMs: 39670,
    llmServerDecodeMs: 9281,
  },
  time: 1786256828783,
})

test("parses a real step.end wire line", () => {
  const step = parseStepEndLine(STEP_END_LINE)
  expect(step).toEqual({ outputTokens: 482, decodeMs: 9281, ttftMs: 39672 })
})

test("falls back to stream duration when server decode is missing", () => {
  const line = JSON.stringify({
    type: "context.append_loop_event",
    event: { type: "step.end", usage: { output: 100 }, llmStreamDurationMs: 2000, llmFirstTokenLatencyMs: 50 },
  })
  expect(parseStepEndLine(line)).toEqual({ outputTokens: 100, decodeMs: 2000, ttftMs: 50 })
})

test("ignores unrelated, malformed, and empty-output lines", () => {
  expect(parseStepEndLine(JSON.stringify({ type: "usage.record", usage: { output: 10 } }))).toBeUndefined()
  expect(parseStepEndLine('{"type":"context.append_loop_event","event":{"type":"step.end"')).toBeUndefined()
  expect(
    parseStepEndLine(JSON.stringify({ event: { type: "step.end", usage: { output: 0 }, llmServerDecodeMs: 100 } })),
  ).toBeUndefined()
  expect(parseStepEndLine("")).toBeUndefined()
})

test("accumulates session averages and keeps the last step rate", () => {
  const stats = createSessionStats()
  accumulateStep(stats, { outputTokens: 482, decodeMs: 9281, ttftMs: 39672 })
  accumulateStep(stats, { outputTokens: 472, decodeMs: 9172, ttftMs: 9650 })

  expect(stats.steps).toBe(2)
  expect(stats.lastTps).toBeCloseTo(472 / 9.172, 5)
  expect(averageTps(stats)).toBeCloseTo((482 + 472) / ((9281 + 9172) / 1000), 5)
  expect(averageTtftMs(stats)).toBeCloseTo((39672 + 9650) / 2, 5)
})

test("steps without TTFT do not poison the TTFT average", () => {
  const stats = createSessionStats()
  accumulateStep(stats, { outputTokens: 100, decodeMs: 1000 })
  accumulateStep(stats, { outputTokens: 100, decodeMs: 1000, ttftMs: 800 })
  expect(averageTtftMs(stats)).toBe(800)
})

test("builds the status line with snapshot prefix and empty placeholders", () => {
  const stats = createSessionStats()
  accumulateStep(stats, { outputTokens: 482, decodeMs: 9281, ttftMs: 39672 })

  const line = buildStatusLine({ model: "K3", gitBranch: "main", planMode: false }, stats)
  expect(line).toBe("K3 » ⎇ main » ◆ defdo.dev » TPS 51.9 t/s » AVG 51.9 t/s » TTFT 39.7s")

  expect(buildStatusLine({}, createSessionStats())).toBe("◆ defdo.dev » TPS ∅ » AVG ∅ » TTFT ∅")
})
