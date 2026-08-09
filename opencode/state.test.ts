import { expect, test } from "bun:test"
import {
  acceptDelta,
  clearSessionState,
  createTrackerState,
  DELTA_DEDUPE_WINDOW_MS,
  pruneDeltaState,
  pruneSessionAverages,
  SESSION_AVERAGE_TTL_MS,
} from "./state"

test("replayed delta snapshots are accepted only once", () => {
  const tracker = createTrackerState()
  const delta = { sessionID: "session-1", messageID: "message-1", partID: "part-1" }

  expect(acceptDelta(tracker, delta, "hello", 100)).toBe(true)
  expect(acceptDelta(tracker, delta, "hello", 100)).toBe(false)
  expect(acceptDelta(tracker, delta, "hello!", 101)).toBe(true)
})

test("idle cleanup removes transient session state but keeps its recent average", () => {
  const tracker = createTrackerState()
  tracker.streamSamplesBySession["session-1"] = [{ at: 1, tokens: 1 }]
  tracker.messageTimingByID["message-1"] = { sessionID: "session-1", requestStartAt: 1 }
  acceptDelta(tracker, { sessionID: "session-1", messageID: "message-1", partID: "part-1" }, "hello", 100)
  tracker.sessionAverageByID["session-1"] = {
    totalTokens: 1,
    totalDurationMs: 1,
    totalTtftMs: 1,
    messageCount: 1,
    lastActivityAt: 100,
  }
  tracker.lastTpsBySession["session-1"] = { tps: 9.5, at: 100 }

  expect(clearSessionState(tracker, "session-1")).toBe(true)
  expect(tracker.streamSamplesBySession["session-1"]).toBeUndefined()
  expect(tracker.messageTimingByID["message-1"]).toBeUndefined()
  expect(tracker.lastDeltaByPart["message-1:part-1"]).toBeDefined()
  expect(tracker.sessionAverageByID["session-1"]).toBeDefined()
  expect(tracker.lastTpsBySession["session-1"]).toBeDefined()
  expect(pruneDeltaState(tracker, 100 + DELTA_DEDUPE_WINDOW_MS + 1)).toBe(true)
  expect(tracker.lastDeltaByPart["message-1:part-1"]).toBeUndefined()
})

test("deleted and expired sessions cannot retain averages", () => {
  const tracker = createTrackerState()
  tracker.sessionAverageByID["deleted"] = {
    totalTokens: 1,
    totalDurationMs: 1,
    totalTtftMs: 1,
    messageCount: 1,
    lastActivityAt: 100,
  }
  tracker.sessionAverageByID["expired"] = {
    totalTokens: 1,
    totalDurationMs: 1,
    totalTtftMs: 1,
    messageCount: 1,
    lastActivityAt: 100,
  }
  tracker.lastTpsBySession["deleted"] = { tps: 9.5, at: 100 }
  acceptDelta(tracker, { sessionID: "deleted", messageID: "message-2", partID: "part-2" }, "hello", 100)

  expect(clearSessionState(tracker, "deleted", true, true)).toBe(true)
  expect(tracker.sessionAverageByID.deleted).toBeUndefined()
  expect(tracker.lastTpsBySession.deleted).toBeUndefined()
  expect(tracker.lastDeltaByPart["message-2:part-2"]).toBeUndefined()
  expect(pruneSessionAverages(tracker, 100 + SESSION_AVERAGE_TTL_MS + 1)).toBe(true)
  expect(tracker.sessionAverageByID.expired).toBeUndefined()
})
