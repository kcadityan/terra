import type { EventBase, EventStore, Reducer, SnapshotStore, Serializer } from './types';

export type ReplayOptions<S> = {
  snapshotEvery?: number;
  init: () => S;
  serializer?: Serializer<S>;
};

export class LogEngine<S, E extends EventBase> {
  constructor(
    private store: EventStore<E>,
    private reducer: Reducer<S, E>,
    private snapshots?: SnapshotStore<S>,
    private opts?: ReplayOptions<S>,
  ) {}

  private clone(state: S): S {
    return this.opts?.serializer ? this.opts.serializer.clone(state) : state;
  }

  async replay(stream: string): Promise<{ state: S; lastSeq: number }> {
    let snapshot = this.snapshots ? await this.snapshots.load(stream) : null;
    let state = this.clone(snapshot?.state ?? this.opts!.init());
    let seq = snapshot?.seq ?? 0;

    while (true) {
      const { events, lastSeq, eof } = await this.store.read(stream, seq + 1, 1000);
      for (const event of events) {
        state = this.reducer(state, event);
      }
      seq = lastSeq ?? seq;

      if (this.snapshots && this.opts?.snapshotEvery && events.length > 0) {
        const countSinceSnapshot = seq - (snapshot?.seq ?? 0);
        if (countSinceSnapshot >= this.opts.snapshotEvery) {
          await this.snapshots.save(stream, state, seq);
          snapshot = { state: this.clone(state), seq };
        }
      }

      if (eof) break;
    }

    return { state, lastSeq: seq };
  }

  async apply(stream: string, newEvents: ReadonlyArray<E>): Promise<{ state: S; lastSeq: number }> {
    const { state, lastSeq } = await this.replay(stream);
    const appendResult = await this.store.append(stream, newEvents, { expectedSeq: lastSeq });

    let nextState = state;
    for (const event of newEvents) {
      nextState = this.reducer(nextState, event);
    }

    if (this.snapshots && this.opts?.snapshotEvery) {
      const countSinceSnapshot = appendResult.lastSeq - (await this.snapshots.load(stream))?.seq ?? appendResult.lastSeq;
      if (countSinceSnapshot >= this.opts.snapshotEvery) {
        await this.snapshots.save(stream, nextState, appendResult.lastSeq);
      }
    }

    return { state: nextState, lastSeq: appendResult.lastSeq };
  }
}
