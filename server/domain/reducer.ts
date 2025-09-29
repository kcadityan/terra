import type { Reducer } from '@terra/event-log';
import type { WorldState } from './state';
import type { DomainEvent } from './events';
import { defaultPlayerSnapshot } from './state';

export const reduce: Reducer<WorldState, DomainEvent> = (state, event) => {
  switch (event.type) {
    case 'player.mined': {
      return {
        ...state,
        blocks: state.blocks.concat({ tileX: event.tileX, tileY: event.tileY, material: 'air' }),
      };
    }
    case 'player.placed': {
      return {
        ...state,
        blocks: state.blocks.concat({ tileX: event.tileX, tileY: event.tileY, material: event.material }),
      };
    }
    case 'player.changedTool': {
      const player = state.players[event.playerId] ?? defaultPlayerSnapshot(event.playerId);
      const updatedPlayer = { ...player, currentTool: event.tool };
      return {
        ...state,
        players: { ...state.players, [event.playerId]: updatedPlayer },
      };
    }
    case 'player.inventoryUpdated': {
      const player = state.players[event.playerId] ?? defaultPlayerSnapshot(event.playerId);
      const updatedPlayer = { ...player, inventory: event.inventory };
      return {
        ...state,
        players: { ...state.players, [event.playerId]: updatedPlayer },
      };
    }
    case 'player.shot': {
      return state;
    }
    case 'player.respawned': {
      const player = state.players[event.playerId] ?? defaultPlayerSnapshot(event.playerId);
      const updatedPlayer = {
        ...player,
        x: event.x,
        y: event.y,
        hp: event.hp,
        energy: event.energy,
      };
      return {
        ...state,
        players: { ...state.players, [event.playerId]: updatedPlayer },
      };
    }
    default: {
      const exhaustive: never = event;
      return state;
    }
  }
};
