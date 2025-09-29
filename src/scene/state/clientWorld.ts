import type { BlockChange, InventoryCounts, PlayerShotMessage } from '../../shared/protocol';
import type { Material } from '../../shared/game-types';

export interface ClientWorldState {
  readonly blocks: Map<string, Material>;
  readonly inventory: InventoryCounts;
  readonly recentShots: PlayerShotMessage[];
}

export type ClientEvent =
  | { type: 'world-update'; changes: BlockChange[] }
  | { type: 'inventory-update'; inventory: InventoryCounts }
  | { type: 'player-shot'; payload: PlayerShotMessage };

export function initialClientWorldState(): ClientWorldState {
  return {
    blocks: new Map(),
    inventory: {
      grass: 0,
      dirt: 0,
      rock: 0,
      wood: 0,
      coal: 0,
      copper: 0,
      silver: 0,
      gold: 0,
      diamond: 0,
    },
    recentShots: [],
  };
}

function cloneState(state: ClientWorldState): ClientWorldState {
  return {
    blocks: new Map(state.blocks),
    inventory: { ...state.inventory },
    recentShots: state.recentShots.slice(-10),
  };
}

function key(change: { tileX: number; tileY: number }): string {
  return `${change.tileX},${change.tileY}`;
}

export function reduceClientEvent(state: ClientWorldState, event: ClientEvent): ClientWorldState {
  switch (event.type) {
    case 'world-update': {
      const next = cloneState(state);
      for (const change of event.changes) {
        const k = key(change);
        if (change.mat === 'air') {
          next.blocks.delete(k);
        } else {
          next.blocks.set(k, change.mat);
        }
      }
      return next;
    }
    case 'inventory-update': {
      return {
        ...state,
        inventory: { ...event.inventory },
      };
    }
    case 'player-shot': {
      const nextShots = state.recentShots.concat(event.payload).slice(-20);
      return { ...state, recentShots: nextShots };
    }
    default: {
      const exhaustive: never = event;
      return state;
    }
  }
}
