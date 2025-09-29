import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonlEventStore, JsonSnapshotStore } from '../src/adapters/jsonl';
import type { EventBase } from '../src/types';

interface TestEvent extends EventBase {
  type: 'test';
  value: number;
}

describe('JsonlEventStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'event-log-'));
  });

  it('appends and reads events', async () => {
    const store = new JsonlEventStore<TestEvent>(dir);
    await store.append('s1', [
      { id: '1', ts: 0, type: 'test', value: 1 },
      { id: '2', ts: 1, type: 'test', value: 2 },
    ]);

    const { events, lastSeq, eof } = await store.read('s1');
    expect(events).toHaveLength(2);
    expect(lastSeq).toBe(2);
    expect(eof).toBe(true);
    expect(events[1].value).toBe(2);
  });

  it('stores snapshots', async () => {
    const snapshots = new JsonSnapshotStore<number>(dir);
    await snapshots.save('s2', 42, 10);
    const loaded = await snapshots.load('s2');
    expect(loaded).toEqual({ state: 42, seq: 10 });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });
});
