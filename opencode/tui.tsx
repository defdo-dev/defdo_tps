/** @jsxImportSource @opentui/solid */
import type { RGBA } from "@opentui/core"
import { Plugin } from "@opencode/plugin/tui"
import { Show, createMemo, createSignal } from "solid-js"
import { formatRate, formatTtft } from "../shared/format"
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
// OpenCode 2 replays the event stream after reconnects; a short window drops
// immediate double deliveries without eating legitimate repeated chunks.
const DELTA_DEDUPE_MS = 750

function estimateStreamTokens(delta: string) {
  return Math.max(1, Math.ceil(new TextEncoder().encode(delta).length / 5))
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
  muted: RGBA
  sessionID?: string
  tracker: TrackerState
  status: () => "idle" | "running" | undefined
  version: () => number
  clock: () => number
}) {
  const sessionAverage = createMemo(() => {
    props.version()
    const totals = props.tracker.sessionAverageByID[props.sessionID ?? ""]
    if (!totals || totals.totalTokens <= 0 || totals.totalDurationMs <= 0) return undefined
    return formatRate(totals.totalTokens / (totals.totalDurationMs / 1000))
  })

  const sessionTtft = createMemo(() => {
    props.version()
    const totals = props.tracker.sessionAverageByID[props.sessionID ?? ""]
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
    const sessionID = props.sessionID
    if (!sessionID) return undefined
    const status = props.status()
    if (status === "idle") return lastTps(sessionID)

    const samples = props.tracker.streamSamplesBySession[sessionID] ?? []
    const now = Date.now()
    const relevant = samples.filter((sample) => now - sample.at <= STREAM_WINDOW_MS)
    const lastSample = relevant[relevant.length - 1]
    if (!lastSample || now - lastSample.at > LIVE_STALE_MS) return lastTps(sessionID)

    const tokens = relevant.reduce((sum, sample) => sum + sample.tokens, 0)
    const tps = tokens / (activeDurationMs(relevant, now) / 1000)
    props.tracker.lastTpsBySession[sessionID] = { tps, at: now }
    return formatRate(tps)
  })

  return (
    <Show when={props.sessionID}>
      <text fg={props.muted}>
        ◆ defdo.dev » TPS {liveTps() ?? "∅"} » AVG {sessionAverage() ?? "∅"} » TTFT {sessionTtft() ?? "∅"}
      </text>
    </Show>
  )
}

export default Plugin.define({
  id: "defdo-tps-sidebar",
  setup(context) {
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

    const recordDelta = (sessionID: string, messageID: string, ordinal: number, delta: string) => {
      if (!acceptDelta(tracker, { sessionID, messageID, partID: String(ordinal) }, delta, Date.now(), DELTA_DEDUPE_MS))
        return

      appendSample(sessionID, messageID, {
        at: Date.now(),
        tokens: estimateStreamTokens(delta),
      })
    }

    const subscriptions = [
      context.data.on("session.text.delta", (event) => {
        recordDelta(event.data.sessionID, event.data.assistantMessageID, event.data.ordinal, event.data.delta)
      }),
      context.data.on("session.reasoning.delta", (event) => {
        recordDelta(event.data.sessionID, event.data.assistantMessageID, event.data.ordinal, event.data.delta)
      }),
      context.data.on("session.step.started", (event) => {
        tracker.messageTimingByID[event.data.assistantMessageID] = {
          sessionID: event.data.sessionID,
          requestStartAt: event.data.started ?? event.created,
        }
        bump()
      }),
      context.data.on("session.text.started", (event) => {
        const timing = tracker.messageTimingByID[event.data.assistantMessageID]
        if (!timing || typeof timing.firstResponseAt === "number") return
        tracker.messageTimingByID[event.data.assistantMessageID] = { ...timing, firstResponseAt: event.created }
        bump()
      }),
      context.data.on("session.reasoning.started", (event) => {
        const timing = tracker.messageTimingByID[event.data.assistantMessageID]
        if (!timing || typeof timing.firstResponseAt === "number") return
        tracker.messageTimingByID[event.data.assistantMessageID] = { ...timing, firstResponseAt: event.created }
        bump()
      }),
      context.data.on("session.tool.called", (event) => {
        clearLiveSamples(event.data.sessionID)
        const timing = tracker.messageTimingByID[event.data.assistantMessageID]
        if (!timing) return
        tracker.messageTimingByID[event.data.assistantMessageID] = { ...timing, lastToolCallAt: event.created }
        bump()
      }),
      context.data.on("session.step.ended", (event) => {
        const { sessionID, assistantMessageID, tokens, finish } = event.data
        const timing = tracker.messageTimingByID[assistantMessageID]
        if (timing) delete tracker.messageTimingByID[assistantMessageID]

        const totalTokens = tokens.output + tokens.reasoning
        if (timing && totalTokens > 0 && typeof timing.firstResponseAt === "number") {
          const endAt = finish === "tool-calls" ? timing.lastToolCallAt : event.created
          const durationMs = typeof endAt === "number" ? Math.max(endAt - timing.firstResponseAt, 1) : undefined
          const ttftMs = Math.max(timing.firstResponseAt - timing.requestStartAt, 0)

          if (durationMs) {
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

        clearLiveSamples(sessionID)
        pruneSamples(event.created)
        bump()
      }),
      context.data.on("session.step.failed", (event) => {
        delete tracker.messageTimingByID[event.data.assistantMessageID]
        clearLiveSamples(event.data.sessionID)
        bump()
      }),
      context.data.on("session.idle", (event) => {
        cleanupSession(event.data.sessionID)
      }),
      context.data.on("session.deleted", (event) => {
        cleanupSession(event.data.sessionID, true)
      }),
    ]

    const timer = setInterval(() => {
      setClock(Date.now())
      pruneSamples()
      if (pruneDeltaState(tracker)) bump()
      if (pruneSessionAverages(tracker)) bump()
    }, 1000)

    const unregisterSlot = context.ui.slot({
      append: "prompt.footer.status",
      render: (input) => (
        <TpsPromptRight
          muted={context.theme.text.muted}
          sessionID={input.sessionID}
          tracker={tracker}
          status={() => (input.sessionID ? context.data.session.status(input.sessionID) : undefined)}
          version={version}
          clock={clock}
        />
      ),
    })

    return () => {
      for (const unsubscribe of subscriptions) unsubscribe()
      unregisterSlot()
      clearInterval(timer)
    }
  },
})
