import type { Reducer } from '@terra/event-log';
import type { DomainEvent } from './events';
import {
  type WorldState,
  type PlayerId,
  defaultPlayerSnapshot,
  pushBlocks,
  upsertPlayer,
  toInventorySnapshot,
} from './state';

export const reduce: Reducer<WorldState, DomainEvent> = (state, event) => {
  switch (event.type) {
    case 'player.mined': {
      return pushBlocks(state, [{ tileX: event.tileX, tileY: event.tileY, material: 'air' }]);
    }
    case 'player.placed': {
      return pushBlocks(state, [{ tileX: event.tileX, tileY: event.tileY, material: event.material }]);
    }
    case 'player.changedTool': {
      const playerId = event.playerId as PlayerId;
      const player = state.players[playerId] ?? defaultPlayerSnapshot(event.playerId);
      return upsertPlayer(state, { ...player, currentTool: event.tool });
    }
    case 'player.inventoryUpdated': {
      const playerId = event.playerId as PlayerId;
      const player = state.players[playerId] ?? defaultPlayerSnapshot(event.playerId);
      return upsertPlayer(state, { ...player, inventory: toInventorySnapshot(event.inventory) });
    }
    case 'player.shot': {
      return state;
    }
    case 'player.respawned': {
      const playerId = event.playerId as PlayerId;
      const player = state.players[playerId] ?? defaultPlayerSnapshot(event.playerId);
      return upsertPlayer(state, {
        ...player,
        x: event.x,
        y: event.y,
        hp: event.hp,
        energy: event.energy,
      });
    }
    default: {
      const exhaustive: never = event;
      return state;
    }
  }
};
