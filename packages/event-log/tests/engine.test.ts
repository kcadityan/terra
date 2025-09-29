import { describe, expect, it } from 'vitest';
import { LogEngine } from '../src/engine';
import { MemoryEventStore, MemorySnapshotStore } from '../src/adapters/memory';
import type { EventBase, Reducer } from '../src/types';

type CounterState = { value: number };
interface CounterEvent extends EventBase {
  type: 'inc' | 'dec';
  amount: number;
}

const reducer: Reducer<CounterState, CounterEvent> = (state, event) => {
  switch (event.type) {
    case 'inc':
      return { value: state.value + event.amount };
    case 'dec':
      return { value: state.value - event.amount };
    default:
      return state;
  }
};

describe('LogEngine', () => {
  it('replays and applies events', async () => {
    const store = new MemoryEventStore<CounterEvent>();
    const snapshots = new MemorySnapshotStore<CounterState>();
    const engine = new LogEngine<CounterState, CounterEvent>(store, reducer, snapshots, {
      init: () => ({ value: 0 }),
      snapshotEvery: 2,
      serializer: { clone: (state) => ({ ...state }) },
    });

    const stream = 'counter:1';

    await engine.apply(stream, [
      { id: '1', type: 'inc', ts: Date.now(), amount: 5 },
      { id: '2', type: 'dec', ts: Date.now(), amount: 2 },
    ]);

    const replayResult = await engine.replay(stream);
    expect(replayResult.state.value).toBe(3);

    const after = await engine.apply(stream, [{ id: '3', type: 'inc', ts: Date.now(), amount: 4 }]);
    expect(after.state.value).toBe(7);
  });

  it('enforces optimistic concurrency at store level', async () => {
    const store = new MemoryEventStore<CounterEvent>();
    const stream = 'counter:2';

    await store.append(stream, [{ id: '1', type: 'inc', ts: Date.now(), amount: 1 }]);

    await expect(
      store.append(stream, [{ id: '2', type: 'inc', ts: Date.now(), amount: 1 }], { expectedSeq: 0 }),
    ).rejects.toThrow('ConcurrencyError');
  });
});
