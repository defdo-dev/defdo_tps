export type StreamSample = {
  at: number
  tokens: number
}

export type MessageTiming = {
  sessionID: string
  requestStartAt: number
  firstResponseAt?: number
  firstTokenAt?: number
  lastToolCallAt?: number
}

export type SessionAverage = {
  totalTokens: number
  totalDurationMs: number
  totalTtftMs: number
  messageCount: number
  lastActivityAt: number
}

type LastDelta = {
  sessionID: string
  messageID: string
  text: string
  at: number
}

export type LastTps = {
  tps: number
  at: number
}

export type TrackerState = {
  streamSamplesBySession: Record<string, StreamSample[]>
  messageTimingByID: Record<string, MessageTiming>
  sessionAverageByID: Record<string, SessionAverage>
  lastTpsBySession: Record<string, LastTps>
  lastDeltaByPart: Record<string, LastDelta>
}

export const SESSION_AVERAGE_TTL_MS = 30 * 60 * 1000
export const DELTA_DEDUPE_WINDOW_MS = 5_000

export function createTrackerState(): TrackerState {
  return {
    streamSamplesBySession: {},
    messageTimingByID: {},
    sessionAverageByID: {},
    lastTpsBySession: {},
    lastDeltaByPart: {},
  }
}

export function acceptDelta(
  tracker: TrackerState,
  delta: { sessionID: string; messageID: string; partID: string },
  partText: string,
  at = Date.now(),
) {
  const key = `${delta.messageID}:${delta.partID}`
  const previous = tracker.lastDeltaByPart[key]
  if (
    previous?.sessionID === delta.sessionID &&
    previous.text === partText &&
    at - previous.at <= DELTA_DEDUPE_WINDOW_MS
  ) {
    return false
  }

  tracker.lastDeltaByPart[key] = {
    sessionID: delta.sessionID,
    messageID: delta.messageID,
    text: partText,
    at,
  }
  return true
}

export function pruneDeltaState(tracker: TrackerState, now = Date.now(), ttl = DELTA_DEDUPE_WINDOW_MS) {
  let changed = false
  for (const [key, delta] of Object.entries(tracker.lastDeltaByPart)) {
    if (now - delta.at <= ttl) continue
    delete tracker.lastDeltaByPart[key]
    changed = true
  }
  return changed
}

export function clearSessionState(
  tracker: TrackerState,
  sessionID: string,
  removeAverage = false,
  removeDeltas = false,
) {
  let changed = false

  if (tracker.streamSamplesBySession[sessionID]) {
    delete tracker.streamSamplesBySession[sessionID]
    changed = true
  }

  for (const [messageID, timing] of Object.entries(tracker.messageTimingByID)) {
    if (timing.sessionID !== sessionID) continue
    delete tracker.messageTimingByID[messageID]
    changed = true
  }

  if (removeDeltas) {
    for (const [key, delta] of Object.entries(tracker.lastDeltaByPart)) {
      if (delta.sessionID !== sessionID) continue
      delete tracker.lastDeltaByPart[key]
      changed = true
    }
  }

  if (removeAverage && tracker.sessionAverageByID[sessionID]) {
    delete tracker.sessionAverageByID[sessionID]
    changed = true
  }

  if (removeAverage && tracker.lastTpsBySession[sessionID]) {
    delete tracker.lastTpsBySession[sessionID]
    changed = true
  }

  return changed
}

export function pruneSessionAverages(tracker: TrackerState, now = Date.now(), ttl = SESSION_AVERAGE_TTL_MS) {
  let changed = false
  for (const [sessionID, average] of Object.entries(tracker.sessionAverageByID)) {
    if (now - average.lastActivityAt <= ttl) continue
    delete tracker.sessionAverageByID[sessionID]
    changed = true
  }
  return changed
}
