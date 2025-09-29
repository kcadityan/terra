export type EventBase = Readonly<{
  id: string;
  type: string;
  ts: number;
  seq?: number;
  meta?: Record<string, unknown>;
}>;

export type Reducer<S, E extends EventBase> = (state: S, event: E) => S;

export interface EventStore<E extends EventBase> {
  append(stream: string, events: ReadonlyArray<E>, opts?: { expectedSeq?: number }): Promise<{ lastSeq: number }>;
  read(stream: string, fromSeq?: number, limit?: number): Promise<{ events: E[]; lastSeq?: number; eof: boolean }>;
}

export interface SnapshotStore<S> {
  load(stream: string): Promise<{ state: S; seq: number } | null>;
  save(stream: string, state: S, seq: number): Promise<void>;
}

export interface Serializer<S> {
  clone(value: S): S;
}
