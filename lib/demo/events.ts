// lib/demo/events.ts — browser events the guided tour listens for (client-safe).

export const RUN_EVENT = "boxbot:run";
/** "Replay tour" from the sidebar (the drawer closes on it, too). */
export const REPLAY_EVENT = "boxbot:tour-replay";

/** start: the run was admitted and is streaming; done: the stream ended; refreshed: the page re-rendered with the result. */
export type RunPhase = "start" | "done" | "refreshed";

export function emitRun(phase: RunPhase, ok = true) {
  window.dispatchEvent(new CustomEvent(RUN_EVENT, { detail: { phase, ok } }));
}
