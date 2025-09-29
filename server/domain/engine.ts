import { LogEngine, MemoryEventStore, MemorySnapshotStore } from '@terra/event-log';
import { initialWorldState, type WorldState } from './state';
import { reduce } from './reducer';
import type { DomainEvent } from './events';

export interface WorldLog {
  getState(): WorldState;
  append(events: ReadonlyArray<DomainEvent>): Promise<void>;
  replay(): Promise<WorldState>;
}

class WorldLogImpl implements WorldLog {
  private engine: LogEngine<WorldState, DomainEvent>;
  private state: WorldState;
  private lastSeq = 0;

  constructor(private stream: string) {
    const store = new MemoryEventStore<DomainEvent>();
    const snapshots = new MemorySnapshotStore<WorldState>();
    this.engine = new LogEngine(store, reduce, snapshots, {
      init: initialWorldState,
      snapshotEvery: 1000,
      serializer: { clone: (value) => structuredClone(value) },
    });
    this.state = initialWorldState();
  }

  getState(): WorldState {
    return this.state;
  }

  async replay(): Promise<WorldState> {
    const { state, lastSeq } = await this.engine.replay(this.stream);
    this.state = state;
    this.lastSeq = lastSeq;
    return state;
  }

  async append(events: ReadonlyArray<DomainEvent>): Promise<void> {
    if (events.length === 0) return;
    const { state, lastSeq } = await this.engine.apply(this.stream, events);
    this.state = state;
    this.lastSeq = lastSeq;
  }
}

export function createWorldLog(stream: string): WorldLog {
  return new WorldLogImpl(stream);
}
