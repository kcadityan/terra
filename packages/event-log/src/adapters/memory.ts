import type { EventBase, EventStore, SnapshotStore } from '../types';

export class MemoryEventStore<E extends EventBase> implements EventStore<E> {
  private streams = new Map<string, E[]>();

  async append(stream: string, events: readonly E[], opts?: { expectedSeq?: number }) {
    const list = this.streams.get(stream) ?? [];
    const current = list.length;
    if (opts?.expectedSeq != null && opts.expectedSeq !== current) {
      throw new Error(`ConcurrencyError expected ${opts.expectedSeq} got ${current}`);
    }
    const stamped = events.map((event, idx) => ({ ...event, seq: current + idx + 1 })) as E[];
    list.push(...stamped);
    this.streams.set(stream, list);
    return { lastSeq: list.length };
  }

  async read(stream: string, fromSeq = 1, limit = 1000) {
    const list = this.streams.get(stream) ?? [];
    const slice = list.slice(fromSeq - 1, fromSeq - 1 + limit);
    const lastSeq = slice.length ? slice[slice.length - 1].seq : fromSeq - 1;
    const eof = fromSeq - 1 + slice.length >= list.length;
    return { events: slice, lastSeq, eof };
  }
}

export class MemorySnapshotStore<S> implements SnapshotStore<S> {
  private snapshots = new Map<string, { state: S; seq: number }>();

  async load(stream: string) {
    return this.snapshots.get(stream) ?? null;
  }

  async save(stream: string, state: S, seq: number) {
    this.snapshots.set(stream, { state, seq });
  }
}
