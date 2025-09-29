import { mkdir, readFile, writeFile, appendFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import type { EventBase, EventStore, SnapshotStore } from '../types';

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export class JsonlEventStore<E extends EventBase> implements EventStore<E> {
  constructor(private baseDir: string) {}

  private fileFor(stream: string) {
    return join(this.baseDir, `${stream}.jsonl`);
  }

  private async ensureDir(path: string) {
    await mkdir(path, { recursive: true });
  }

  async append(stream: string, events: readonly E[], opts?: { expectedSeq?: number }) {
    const file = this.fileFor(stream);
    await this.ensureDir(this.baseDir);

    let existing: E[] = [];
    if (await pathExists(file)) {
      const content = await readFile(file, 'utf8');
      existing = content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as E);
    }

    const current = existing.length;
    if (opts?.expectedSeq != null && opts.expectedSeq !== current) {
      throw new Error(`ConcurrencyError expected ${opts.expectedSeq} got ${current}`);
    }

    const stamped = events.map((event, idx) => ({ ...event, seq: current + idx + 1 })) as E[];
    const lines = stamped.map((evt) => JSON.stringify(evt) + '\n').join('');
    await appendFile(file, lines, 'utf8');

    return { lastSeq: current + events.length };
  }

  async read(stream: string, fromSeq = 1, limit = 1000) {
    const file = this.fileFor(stream);
    if (!(await pathExists(file))) {
      return { events: [], lastSeq: fromSeq - 1, eof: true };
    }
    const content = await readFile(file, 'utf8');
    const list = content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as E);
    const slice = list.slice(fromSeq - 1, fromSeq - 1 + limit);
    const lastSeq = slice.length ? slice[slice.length - 1].seq ?? fromSeq - 1 : fromSeq - 1;
    const eof = fromSeq - 1 + slice.length >= list.length;
    return { events: slice, lastSeq, eof };
  }
}

export class JsonSnapshotStore<S> implements SnapshotStore<S> {
  constructor(private baseDir: string) {}

  private fileFor(stream: string) {
    return join(this.baseDir, `${stream}.snapshot.json`);
  }

  async load(stream: string) {
    const file = this.fileFor(stream);
    if (!(await pathExists(file))) return null;
    const content = await readFile(file, 'utf8');
    return JSON.parse(content) as { state: S; seq: number };
  }

  async save(stream: string, state: S, seq: number) {
    const file = this.fileFor(stream);
    await mkdir(this.baseDir, { recursive: true });
    await writeFile(file, JSON.stringify({ state, seq }), 'utf8');
  }
}
