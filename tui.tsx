/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { createMemo, createSignal } from "solid-js"
import {
  acceptDelta,
  clearSessionState,
  createTrackerState,
  pruneDeltaState,
  pruneSessionAverages,
  type StreamSample,
  type TrackerState,
} from "./state"

const STREAM_WINDOW_MS = 5_000
const LIVE_STALE_MS = 1_500
const SINGLE_SAMPLE_MS = 1_000

function estimateStreamTokens(delta: string) {
  return Math.max(1, Math.ceil(new TextEncoder().encode(delta).length / 5))
}

function formatRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return undefined
  const formatted = value >= 100 ? Math.round(value).toString() : value >= 10 ? value.toFixed(1) : value.toFixed(2)
  return `${formatted} t/s`
}

function formatTtft(value: number) {
  if (!Number.isFinite(value) || value < 0) return undefined
  return `${value.toFixed(1)}s`
}

function activeDurationMs(samples: StreamSample[], tailAt?: number) {
  if (samples.length === 0) return 0
  if (samples.length === 1) {
    const tailDuration = tailAt ? Math.max(0, tailAt - samples[0].at) : SINGLE_SAMPLE_MS
    return Math.min(Math.max(tailDuration, 250), SINGLE_SAMPLE_MS)
  }

  let duration = 0
  for (let index = 1; index < samples.length; index += 1) {
    duration += Math.max(0, samples[index].at - samples[index - 1].at)
  }

  if (tailAt) duration += Math.max(0, tailAt - samples[samples.length - 1].at)
  return Math.max(duration, SINGLE_SAMPLE_MS)
}

function TpsPromptRight(props: {
  api: Parameters<TuiPlugin>[0]
  sessionID: string
  tracker: TrackerState
  version: () => number
  clock: () => number
}) {
  const sessionAverage = createMemo(() => {
    props.version()
    const totals = props.tracker.sessionAverageByID[props.sessionID]
    if (!totals || totals.totalTokens <= 0 || totals.totalDurationMs <= 0) return undefined
    return formatRate(totals.totalTokens / (totals.totalDurationMs / 1000))
  })

  const sessionTtft = createMemo(() => {
    props.version()
    const totals = props.tracker.sessionAverageByID[props.sessionID]
    if (!totals || totals.messageCount <= 0 || totals.totalTtftMs < 0) return undefined
    return formatTtft(totals.totalTtftMs / totals.messageCount / 1000)
  })

  const lastTps = (sessionID: string) => {
    const last = props.tracker.lastTpsBySession[sessionID]
    if (!last) return undefined
    return formatRate(last.tps)
  }

  const liveTps = createMemo(() => {
    props.version()
    props.clock()
    const status = props.api.state.session.status(props.sessionID)
    if (status?.type === "idle") return lastTps(props.sessionID)

    const samples = props.tracker.streamSamplesBySession[props.sessionID] ?? []
    const now = Date.now()
    const relevant = samples.filter((sample) => now - sample.at <= STREAM_WINDOW_MS)
    const lastSample = relevant[relevant.length - 1]
    if (!lastSample || now - lastSample.at > LIVE_STALE_MS) return lastTps(props.sessionID)

    const tokens = relevant.reduce((sum, sample) => sum + sample.tokens, 0)
    const tps = tokens / (activeDurationMs(relevant, now) / 1000)
    props.tracker.lastTpsBySession[props.sessionID] = { tps, at: now }
    return formatRate(tps)
  })

  return (
    <text fg={props.api.theme.current.textMuted}>
      ◆ defdo.dev » TPS {liveTps() ?? "∅"} » AVG {sessionAverage() ?? "∅"} » TTFT {sessionTtft() ?? "∅"}
    </text>
  )
}

const tui: TuiPlugin = async (api) => {
  const tracker: TrackerState = createTrackerState()
  const [version, setVersion] = createSignal(0)
  const [clock, setClock] = createSignal(Date.now())

  const bump = () => setVersion((value) => value + 1)

  const pruneSamples = (now = Date.now()) => {
    let changed = false
    for (const [sessionID, samples] of Object.entries(tracker.streamSamplesBySession)) {
      const next = samples.filter((sample) => now - sample.at <= STREAM_WINDOW_MS)
      if (next.length === samples.length) continue
      changed = true
      if (next.length > 0) tracker.streamSamplesBySession[sessionID] = next
      else delete tracker.streamSamplesBySession[sessionID]
    }
    if (changed) bump()
  }

  const clearLiveSamples = (sessionID: string) => {
    if (!tracker.streamSamplesBySession[sessionID]?.length) return
    delete tracker.streamSamplesBySession[sessionID]
    bump()
  }

  const appendSample = (sessionID: string, messageID: string, sample: StreamSample) => {
    tracker.streamSamplesBySession[sessionID] = [
      ...(tracker.streamSamplesBySession[sessionID] ?? []).filter((item) => sample.at - item.at <= STREAM_WINDOW_MS),
      sample,
    ]

    const timing = tracker.messageTimingByID[messageID]
    if (timing) {
      tracker.messageTimingByID[messageID] = timing.firstTokenAt
        ? { ...timing }
        : { ...timing, firstResponseAt: sample.at, firstTokenAt: sample.at }
    }
    bump()
  }

  const cleanupSession = (sessionID: string, removeAverage = false) => {
    const changed = clearSessionState(tracker, sessionID, removeAverage, removeAverage)
    const deltasPruned = pruneDeltaState(tracker)
    const averagesPruned = pruneSessionAverages(tracker)
    if (changed || deltasPruned || averagesPruned) bump()
  }

  const onDelta = api.event.on("message.part.delta", (event) => {
    if (event.properties.field !== "text") return
    const parts = api.state.part(event.properties.messageID)
    const part = parts.find((item) => item.id === event.properties.partID)
    if (!part || (part.type !== "text" && part.type !== "reasoning")) return
    if (!acceptDelta(tracker, event.properties, part.text, Date.now())) return

    appendSample(event.properties.sessionID, event.properties.messageID, {
      at: Date.now(),
      tokens: estimateStreamTokens(event.properties.delta),
    })
  })

  const onMessage = api.event.on("message.updated", (event) => {
    const info = event.properties.info
    if (info.role !== "assistant") return
    const sessionID = event.properties.sessionID

    if (!info.time.completed) {
      const existing = tracker.messageTimingByID[info.id]
      tracker.messageTimingByID[info.id] = {
        sessionID,
        requestStartAt: info.time.created,
        firstResponseAt: existing?.firstResponseAt,
        firstTokenAt: existing?.firstTokenAt,
        lastToolCallAt: existing?.lastToolCallAt,
      }
      bump()
      return
    }

    const timing = tracker.messageTimingByID[info.id]
    if (timing?.sessionID === sessionID && typeof timing.firstResponseAt === "number") {
      const totalTokens = info.tokens.output + info.tokens.reasoning
      const endAt = info.finish === "tool-calls" ? timing.lastToolCallAt : info.time.completed
      const durationMs = typeof endAt === "number" ? Math.max(endAt - timing.firstResponseAt, 1) : undefined
      const ttftMs = Math.max(timing.firstResponseAt - timing.requestStartAt, 0)

      if (totalTokens > 0 && durationMs) {
        const totals = tracker.sessionAverageByID[sessionID] ?? {
          totalTokens: 0,
          totalDurationMs: 0,
          totalTtftMs: 0,
          messageCount: 0,
        }
        tracker.sessionAverageByID[sessionID] = {
          totalTokens: totals.totalTokens + totalTokens,
          totalDurationMs: totals.totalDurationMs + durationMs,
          totalTtftMs: totals.totalTtftMs + ttftMs,
          messageCount: totals.messageCount + 1,
          lastActivityAt: Date.now(),
        }
      }
    }

    delete tracker.messageTimingByID[info.id]
    pruneSamples(info.time.completed)
    bump()
  })

  const onPart = api.event.on("message.part.updated", (event) => {
    const part = event.properties.part
    if (part.type !== "tool") return
    const sessionID = part.sessionID

    if (part.state.status === "running" || part.state.status === "completed" || part.state.status === "error") {
      clearLiveSamples(sessionID)
    }

    const timing = tracker.messageTimingByID[part.messageID]
    if (!timing) return
    if (part.state.status === "pending") {
      tracker.messageTimingByID[part.messageID] = {
        ...timing,
        firstResponseAt: timing.firstResponseAt ?? event.properties.time,
      }
      bump()
      return
    }
    if (part.state.status === "running") {
      tracker.messageTimingByID[part.messageID] = {
        ...timing,
        lastToolCallAt: part.state.time.start,
      }
      bump()
    }
  })

  const onSessionIdle = api.event.on("session.idle", (event) => {
    cleanupSession(event.properties.sessionID)
  })

  const onSessionDeleted = api.event.on("session.deleted", (event) => {
    cleanupSession(event.properties.sessionID, true)
  })

  const timer = setInterval(() => {
    setClock(Date.now())
    pruneSamples()
    if (pruneDeltaState(tracker)) bump()
    if (pruneSessionAverages(tracker)) bump()
  }, 1000)

  api.lifecycle.onDispose(() => {
    onDelta()
    onMessage()
    onPart()
    onSessionIdle()
    onSessionDeleted()
    clearInterval(timer)
  })

  api.slots.register({
    slots: {
      session_prompt_right(_context, value) {
        return (
          <TpsPromptRight api={api} sessionID={value.session_id} tracker={tracker} version={version} clock={clock} />
        )
      },
    },
  })
}

const plugin: TuiPluginModule & { id: string } = {
  id: "defdo-tps-sidebar",
  tui,
}

export default plugin
