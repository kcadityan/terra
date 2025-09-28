import type { Client } from 'colyseus';
import type { BlockChangeDescriptor } from '../../src/shared/world-primitives';
import type { InventoryCounts, PlayerShotMessage } from '../../src/shared/protocol';

export type TerraBusPayloads = {
  'world-update': { descriptors: BlockChangeDescriptor[]; source?: Client | null };
  'inventory-update': { client: Client; playerId: string; counts: InventoryCounts };
  'action-denied': { client: Client; reason: string };
  'player-shot': { payload: PlayerShotMessage };
};

export type TerraBusEvent = {
  [K in keyof TerraBusPayloads]: { type: K } & TerraBusPayloads[K];
}[keyof TerraBusPayloads];

export class TerraEventBus {
  private listeners: {
    [K in keyof TerraBusPayloads]: Set<(payload: TerraBusPayloads[K]) => void>;
  } = {
    'world-update': new Set(),
    'inventory-update': new Set(),
    'action-denied': new Set(),
    'player-shot': new Set(),
  };

  on<K extends keyof TerraBusPayloads>(type: K, listener: (payload: TerraBusPayloads[K]) => void): () => void {
    this.listeners[type].add(listener);
    return () => {
      this.listeners[type].delete(listener);
    };
  }

  emit<K extends keyof TerraBusPayloads>(type: K, payload: TerraBusPayloads[K]): void {
    for (const listener of this.listeners[type]) {
      listener(payload);
    }
  }
}
