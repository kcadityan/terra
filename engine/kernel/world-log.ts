import { LogEngine, MemoryEventStore, MemorySnapshotStore, type EventStore, type SnapshotStore } from '@terra/event-log';
import { reduce } from './reducer';
import { initialWorldState, type WorldState } from './state';
import type { DomainEvent } from './events';

export interface WorldLog {
  getState(): WorldState;
  append(events: ReadonlyArray<DomainEvent>): Promise<void>;
  replay(): Promise<WorldState>;
}

export interface WorldLogOptions {
  readonly eventStore?: EventStore<DomainEvent>;
  readonly snapshotStore?: SnapshotStore<WorldState>;
  readonly observers?: ReadonlyArray<(events: ReadonlyArray<DomainEvent>) => void>;
}

class WorldLogImpl implements WorldLog {
  private engine: LogEngine<WorldState, DomainEvent>;
  private state: WorldState;
  private lastSeq = 0;
  private observers: ReadonlyArray<(events: ReadonlyArray<DomainEvent>) => void>;

  constructor(private readonly stream: string, options?: WorldLogOptions) {
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

export const createWorldLog = (stream: string, options?: WorldLogOptions): WorldLog =>
  new WorldLogImpl(stream, options);
