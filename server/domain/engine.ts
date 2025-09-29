import { LogEngine, MemoryEventStore, MemorySnapshotStore } from '@terra/event-log';
import type { EventStore, SnapshotStore } from '@terra/event-log';
import { initialWorldState, type WorldState } from './state';
import { reduce } from './reducer';
import type { DomainEvent } from './events';

export interface WorldLog {
  getState(): WorldState;
  append(events: ReadonlyArray<DomainEvent>): Promise<void>;
  replay(): Promise<WorldState>;
}

export interface WorldLogOptions {
  eventStore?: EventStore<DomainEvent>;
  snapshotStore?: SnapshotStore<WorldState>;
  observers?: Array<(events: ReadonlyArray<DomainEvent>) => void>;
}

class WorldLogImpl implements WorldLog {
  private engine: LogEngine<WorldState, DomainEvent>;
  private state: WorldState;
  private lastSeq = 0;
  private observers: Array<(events: ReadonlyArray<DomainEvent>) => void>;

  constructor(private stream: string, options?: WorldLogOptions) {
    const store = options?.eventStore ?? new MemoryEventStore<DomainEvent>();
    const snapshots = options?.snapshotStore ?? new MemorySnapshotStore<WorldState>();
    this.engine = new LogEngine(store, reduce, snapshots, {
      init: initialWorldState,
      snapshotEvery: 1000,
      serializer: { clone: (value) => structuredClone(value) },
    });
    this.state = initialWorldState();
    this.observers = options?.observers ?? [];
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
    for (const observer of this.observers) observer(events);
  }
}

export function createWorldLog(stream: string, options?: WorldLogOptions): WorldLog {
  return new WorldLogImpl(stream, options);
}
