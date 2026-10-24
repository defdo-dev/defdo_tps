import { expect, test } from "bun:test"
import plugin from "./tui"

test("session lifecycle handlers are registered and cleanup unsubscribes the plugin", async () => {
  const handlers = new Map<string, Set<(event: unknown) => void>>()
  const unsubscribed: Array<boolean> = []
  let slotClaim: { append: string; render: (input: unknown) => unknown } | undefined
  let slotRemoved = false
  let timerCleared = false

  const context = {
    data: {
      on(name: string, handler: (event: unknown) => void) {
        const subscribed = handlers.get(name) ?? new Set<(event: unknown) => void>()
        subscribed.add(handler)
        handlers.set(name, subscribed)
        const index = unsubscribed.length
        unsubscribed.push(false)
        return () => {
          subscribed.delete(handler)
          unsubscribed[index] = true
        }
      },
      session: { status: () => "idle" as const },
    },
    ui: {
      slot(claim: { append: string; render: (input: unknown) => unknown }) {
        slotClaim = claim
        return () => {
          slotRemoved = true
        }
      },
    },
    theme: { text: { muted: "muted" } },
    setInterval: undefined,
  } as any

  const realSetInterval = globalThis.setInterval
  globalThis.setInterval = ((callback: () => void) => {
    void callback
    return 0 as unknown as ReturnType<typeof setInterval>
  }) as typeof setInterval
  globalThis.clearInterval = ((id: number) => {
    void id
    timerCleared = true
  }) as typeof clearInterval

  try {
    const cleanup = await plugin.setup(context)

    expect(slotClaim?.append).toBe("prompt.footer.status")
    expect(slotClaim?.render).toBeFunction()
    expect([...handlers.keys()]).toEqual([
      "session.text.delta",
      "session.reasoning.delta",
      "session.step.started",
      "session.text.started",
      "session.reasoning.started",
      "session.tool.called",
      "session.step.ended",
      "session.step.failed",
      "session.idle",
      "session.deleted",
    ])

    for (const eventName of ["session.idle", "session.deleted"]) {
      for (const handler of handlers.get(eventName) ?? []) {
        handler({ data: { sessionID: "session-1" }, created: Date.now() })
      }
    }

    expect(cleanup).toBeFunction()
    if (typeof cleanup === "function") cleanup()
    expect(unsubscribed.every((done) => done)).toBe(true)
    expect(slotRemoved).toBe(true)
    expect(timerCleared).toBe(true)
  } finally {
    globalThis.setInterval = realSetInterval
  }
})

test("session.idle clears tracked state for the session", async () => {
  const handlers = new Map<string, (event: unknown) => void>()

  const context = {
    data: {
      on(name: string, handler: (event: unknown) => void) {
        handlers.set(name, handler)
        return () => handlers.delete(name)
      },
      session: { status: () => "idle" as const },
    },
    ui: { slot: () => () => undefined },
    theme: { text: { muted: "muted" } },
  } as any

  const realSetInterval = globalThis.setInterval
  globalThis.setInterval = (() => 0) as unknown as typeof setInterval
  globalThis.clearInterval = (() => {}) as unknown as typeof clearInterval

  try {
    const cleanup = await plugin.setup(context)

    const delta = handlers.get("session.text.delta")!
    delta({ data: { sessionID: "s1", assistantMessageID: "m1", ordinal: 0, delta: "hello" }, created: Date.now() })
    delta({ data: { sessionID: "s1", assistantMessageID: "m1", ordinal: 0, delta: "hello" }, created: Date.now() })

    handlers.get("session.idle")!({ data: { sessionID: "s1" }, created: Date.now() })

    expect(handlers.size).toBe(10)
    if (typeof cleanup === "function") cleanup()
    expect(handlers.size).toBe(0)
  } finally {
    globalThis.setInterval = realSetInterval
  }
})
