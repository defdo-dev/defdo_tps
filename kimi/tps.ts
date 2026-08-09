import { formatRate, formatTtft } from "../shared/format"

export type KimiSnapshot = {
  model?: string
  cwd?: string
  gitBranch?: string
  permissionMode?: string
  planMode?: boolean
  contextUsage?: number
  contextTokens?: number
  maxContextTokens?: number
  sessionId?: string
  version?: string
}

export type StepEndStats = {
  outputTokens: number
  decodeMs: number
  ttftMs?: number
}

export type SessionStats = {
  totalOutputTokens: number
  totalDecodeMs: number
  totalTtftMs: number
  ttftSamples: number
  steps: number
  lastTps?: number
}

export function createSessionStats(): SessionStats {
  return {
    totalOutputTokens: 0,
    totalDecodeMs: 0,
    totalTtftMs: 0,
    ttftSamples: 0,
    steps: 0,
  }
}

export function parseStepEndLine(line: string): StepEndStats | undefined {
  if (!line.includes('"step.end"')) return undefined
  try {
    const record = JSON.parse(line)
    const event = record?.event ?? record
    if (event?.type !== "step.end") return undefined

    const outputTokens = event.usage?.output
    const decodeMs = event.llmServerDecodeMs ?? event.llmStreamDurationMs
    if (typeof outputTokens !== "number" || outputTokens <= 0) return undefined
    if (typeof decodeMs !== "number" || decodeMs <= 0) return undefined

    const ttftMs =
      typeof event.llmFirstTokenLatencyMs === "number" && event.llmFirstTokenLatencyMs >= 0
        ? event.llmFirstTokenLatencyMs
        : undefined

    return { outputTokens, decodeMs, ttftMs }
  } catch {
    return undefined
  }
}

export function accumulateStep(stats: SessionStats, step: StepEndStats) {
  stats.totalOutputTokens += step.outputTokens
  stats.totalDecodeMs += step.decodeMs
  if (step.ttftMs !== undefined) {
    stats.totalTtftMs += step.ttftMs
    stats.ttftSamples += 1
  }
  stats.steps += 1
  stats.lastTps = step.outputTokens / (step.decodeMs / 1000)
}

export function averageTps(stats: SessionStats) {
  if (stats.totalDecodeMs <= 0 || stats.totalOutputTokens <= 0) return undefined
  return stats.totalOutputTokens / (stats.totalDecodeMs / 1000)
}

export function averageTtftMs(stats: SessionStats) {
  if (stats.ttftSamples <= 0) return undefined
  return stats.totalTtftMs / stats.ttftSamples
}

export function buildStatusLine(snapshot: KimiSnapshot, stats: SessionStats) {
  const prefix: string[] = []
  if (snapshot.model) prefix.push(snapshot.model)
  if (snapshot.gitBranch) prefix.push(`⎇ ${snapshot.gitBranch}`)
  if (snapshot.planMode) prefix.push("plan")

  const tps = formatRate(stats.lastTps ?? 0) ?? "∅"
  const avg = formatRate(averageTps(stats) ?? 0) ?? "∅"
  const ttft = formatTtft((averageTtftMs(stats) ?? -1) / 1000) ?? "∅"
  const defdo = `◆ defdo.dev » TPS ${tps} » AVG ${avg} » TTFT ${ttft}`

  return prefix.length > 0 ? `${prefix.join(" » ")} » ${defdo}` : defdo
}
