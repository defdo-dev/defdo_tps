#!/usr/bin/env bun
import { createHash } from "node:crypto"
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import {
  accumulateStep,
  buildStatusLine,
  createSessionStats,
  type KimiSnapshot,
  parseStepEndLine,
  type SessionStats,
} from "./tps"

const CACHE_DIR = join(tmpdir(), "defdo-tps-kimi")
const CACHE_TTL_MS = 24 * 60 * 60 * 1000

type CacheEntry = {
  wirePath: string
  offset: number
  stats: SessionStats
}

function kimiHome() {
  return process.env.KIMI_CODE_HOME ?? join(homedir(), ".kimi-code")
}

function wireForSessionDir(sessionDir: string) {
  return join(sessionDir, "agents", "main", "wire.jsonl")
}

function resolveWirePath(snapshot: KimiSnapshot): string | undefined {
  const sessionsDir = join(kimiHome(), "sessions")
  if (!existsSync(sessionsDir)) return undefined

  const dirNames = readdirSync(sessionsDir)

  if (snapshot.sessionId) {
    const id = snapshot.sessionId.startsWith("session_") ? snapshot.sessionId : `session_${snapshot.sessionId}`
    for (const dirName of dirNames) {
      const wire = wireForSessionDir(join(sessionsDir, dirName, id))
      if (existsSync(wire)) return wire
    }
  }

  if (snapshot.cwd) {
    const suffix = createHash("sha256").update(snapshot.cwd).digest("hex").slice(0, 12)
    let newest: { wire: string; mtimeMs: number } | undefined
    for (const dirName of dirNames) {
      if (!dirName.endsWith(`_${suffix}`)) continue
      const wdDir = join(sessionsDir, dirName)
      let sessionDirs: string[] = []
      try {
        sessionDirs = readdirSync(wdDir).filter((entry) => entry.startsWith("session_"))
      } catch {
        continue
      }
      for (const sessionName of sessionDirs) {
        const wire = wireForSessionDir(join(wdDir, sessionName))
        try {
          const mtimeMs = statSync(wire).mtimeMs
          if (!newest || mtimeMs > newest.mtimeMs) newest = { wire, mtimeMs }
        } catch {
          continue
        }
      }
    }
    if (newest) return newest.wire
  }

  return undefined
}

function cacheKeyFor(wirePath: string) {
  const sessionDir = wirePath.split("/agents/")[0] ?? wirePath
  return `${createHash("sha256").update(sessionDir).digest("hex").slice(0, 16)}.json`
}

function loadCache(wirePath: string): CacheEntry | undefined {
  try {
    const raw = readFileSync(join(CACHE_DIR, cacheKeyFor(wirePath)), "utf8")
    const entry = JSON.parse(raw) as CacheEntry
    if (entry.wirePath !== wirePath || typeof entry.offset !== "number" || !entry.stats) return undefined
    return entry
  } catch {
    return undefined
  }
}

function saveCache(entry: CacheEntry) {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    writeFileSync(join(CACHE_DIR, cacheKeyFor(entry.wirePath)), JSON.stringify(entry))
  } catch {
    return
  }
}

function pruneCache(now = Date.now()) {
  try {
    for (const name of readdirSync(CACHE_DIR)) {
      const file = join(CACHE_DIR, name)
      if (now - statSync(file).mtimeMs > CACHE_TTL_MS) rmSync(file, { force: true })
    }
  } catch {
    return
  }
}

function consumeNewData(wirePath: string, cache: CacheEntry | undefined): CacheEntry {
  const entry: CacheEntry =
    cache ?? {
      wirePath,
      offset: 0,
      stats: createSessionStats(),
    }

  let fd: number | undefined
  try {
    fd = openSync(wirePath, "r")
    const size = fstatSync(fd).size
    if (size < entry.offset) {
      entry.offset = 0
      entry.stats = createSessionStats()
    }
    if (size <= entry.offset) return entry

    const buffer = Buffer.alloc(size - entry.offset)
    readSync(fd, buffer, 0, buffer.length, entry.offset)
    const chunk = buffer.toString("utf8")
    const lastNewline = chunk.lastIndexOf("\n")
    if (lastNewline < 0) return entry

    const complete = chunk.slice(0, lastNewline)
    for (const line of complete.split("\n")) {
      const step = parseStepEndLine(line)
      if (step) accumulateStep(entry.stats, step)
    }
    entry.offset += Buffer.byteLength(complete, "utf8") + 1
    return entry
  } catch {
    return entry
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

async function readStdin() {
  try {
    return await Bun.stdin.text()
  } catch {
    return ""
  }
}

async function main() {
  const raw = await readStdin()
  let snapshot: KimiSnapshot = {}
  try {
    snapshot = JSON.parse(raw) as KimiSnapshot
  } catch {
    snapshot = {}
  }

  let stats = createSessionStats()
  const wirePath = resolveWirePath(snapshot)
  if (wirePath) {
    const entry = consumeNewData(wirePath, loadCache(wirePath))
    saveCache(entry)
    stats = entry.stats
  }

  pruneCache()
  console.log(buildStatusLine(snapshot, stats))
}

main().catch(() => {
  console.log(buildStatusLine({}, createSessionStats()))
})
