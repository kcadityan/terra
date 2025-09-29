import type { Reducer } from '@terra/event-log/src/types';
import type { WorldState } from './state';
import type { DomainEvent } from './events';

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
      const player = state.players[event.playerId];
      if (!player) return state;
      const updatedPlayer = { ...player, currentTool: event.tool };
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
