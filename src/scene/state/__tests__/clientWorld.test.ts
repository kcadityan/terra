import { describe, expect, it } from 'vitest';
import { initialClientWorldState, reduceClientEvent } from '../clientWorld';

describe('client world reducer', () => {
  it('applies world updates', () => {
    const state = initialClientWorldState();
    const next = reduceClientEvent(state, {
      type: 'world-update',
      changes: [
        { tileX: 1, tileY: 2, mat: 'rock' },
        { tileX: 3, tileY: 4, mat: 'air' },
      ],
    });
    expect(next.blocks.get('1,2')).toBe('rock');
    expect(next.blocks.has('3,4')).toBe(false);
  });

  it('updates inventory snapshot', () => {
    const state = initialClientWorldState();
    const next = reduceClientEvent(state, {
      type: 'inventory-update',
      inventory: { ...state.inventory, rock: 5 },
    });
    expect(next.inventory.rock).toBe(5);
  });

  it('tracks recent shots', () => {
    const state = initialClientWorldState();
    const next = reduceClientEvent(state, {
      type: 'player-shot',
      payload: {
        type: 'player-shot',
        shooterId: 'p1',
        originX: 0,
        originY: 0,
        dirX: 1,
        dirY: 0,
        hitId: null,
      },
    });
    expect(next.recentShots).toHaveLength(1);
    expect(next.recentShots[0].shooterId).toBe('p1');
  });
});
