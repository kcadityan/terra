import { createKernel, type Kernel, type KernelOptions } from '../engine/kernel';
import { createModuleHost, type ModuleHost } from '../engine/kernel/modules';
import { coreServerModule } from '../mods/core/server';
import { JsonlEventStore, JsonSnapshotStore } from '@terra/event-log';
import { join } from 'node:path';

export interface TerraServerContext {
  readonly kernel: Kernel;
  readonly moduleHost: ModuleHost;
}

let ctx: TerraServerContext | null = null;

export async function initServerContext(): Promise<TerraServerContext> {
  if (ctx) return ctx;

  const useMemoryStore = process.env.NODE_ENV === 'test';
  const baseDataDir = process.env.TERRA_EVENT_DIR ?? join(process.cwd(), 'data/events');
  const baseSnapshotDir = process.env.TERRA_SNAPSHOT_DIR ?? join(process.cwd(), 'data/snapshots');

  const options: KernelOptions = {
    stream: process.env.TERRA_STREAM ?? 'terra',
    eventStore: useMemoryStore ? undefined : new JsonlEventStore(baseDataDir),
    snapshotStore: useMemoryStore ? undefined : new JsonSnapshotStore(baseSnapshotDir),
    observers: [
      (events) => {
        for (const evt of events) {
          console.info('[domain-event]', {
            type: evt.type,
            meta: evt.meta ?? {},
            ts: evt.ts,
            id: evt.id,
          });
        }
      },
    ],
  } satisfies KernelOptions;

  const kernel = createKernel(options);
  const moduleHost = createModuleHost(kernel);
  await moduleHost.load(coreServerModule);
  ctx = { kernel, moduleHost };
  return ctx;
}

export function getServerContext(): TerraServerContext {
  if (!ctx) {
    throw new Error('Terra server context not initialised');
  }
  return ctx;
}
