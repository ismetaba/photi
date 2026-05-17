/**
 * SSE hub stub used by T06+ to fan out photo-feature changes and ready
 * notifications. T09 will replace `broadcast` with the real reply-driven
 * implementation. This module exposes a small interface so other code
 * (and tests) only depend on `broadcast`.
 */

export interface FoyerEvent {
  eventId: string;
  type: "photo-featured" | "photo-ready" | "photo-removed" | "ping";
  photoId?: string;
  isFeatured?: boolean;
}

export interface FoyerHub {
  broadcast(evt: FoyerEvent): void;
}

class InMemoryFoyerHub implements FoyerHub {
  private readonly listeners = new Map<string, Set<(e: FoyerEvent) => void>>();

  subscribe(eventId: string, handler: (e: FoyerEvent) => void): () => void {
    if (!this.listeners.has(eventId)) {
      this.listeners.set(eventId, new Set());
    }
    this.listeners.get(eventId)!.add(handler);
    return () => this.listeners.get(eventId)?.delete(handler);
  }

  broadcast(evt: FoyerEvent): void {
    const set = this.listeners.get(evt.eventId);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(evt);
      } catch {
        // Subscriber threw — ignore so one bad listener doesn't break others.
      }
    }
  }

  count(eventId: string): number {
    return this.listeners.get(eventId)?.size ?? 0;
  }
}

export function createFoyerHub(): InMemoryFoyerHub {
  return new InMemoryFoyerHub();
}

export type { InMemoryFoyerHub };
