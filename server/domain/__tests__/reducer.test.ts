import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { initialWorldState } from '../state';
import type { WorldState } from '../state';
import type { DomainEvent } from '../events';

const baseEvent = {
  id: 'evt1',
  ts: 0,
} as const;

describe('domain reducer', () => {
  it('applies mining events', () => {
    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.mined',
      playerId: 'p1',
      tileX: 1,
      tileY: 2,
      material: 'rock',
    };
    const next = reduce(initialWorldState(), event);
    expect(next.blocks).toEqual([{ tileX: 1, tileY: 2, material: 'air' }]);
  });

  it('applies placement events', () => {
    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.placed',
      playerId: 'p1',
      tileX: 3,
      tileY: 4,
      material: 'wood',
    };
    const next = reduce(initialWorldState(), event);
    expect(next.blocks).toEqual([{ tileX: 3, tileY: 4, material: 'wood' }]);
  });

  it('updates player tool when player exists', () => {
    const state = initialWorldState();
    const withPlayer: WorldState = {
      ...state,
      players: {
        p1: {
          id: 'p1',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
         hp: 100,
         energy: 100,
          facing: 1 as const,
          currentTool: 'shovel' as const,
          selectedMat: null,
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
        },
      },
    };

    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.changedTool',
      playerId: 'p1',
      tool: 'pickaxe',
    };

    const next = reduce(withPlayer, event);
    expect(next.players.p1.currentTool).toBe('pickaxe');
  });

  it('updates inventory snapshot', () => {
    const state = initialWorldState();
    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.inventoryUpdated',
      playerId: 'p2',
      inventory: {
        grass: 1,
        dirt: 2,
        rock: 0,
        wood: 0,
        coal: 0,
        copper: 0,
        silver: 0,
        gold: 0,
        diamond: 0,
      },
    };

    const next = reduce(state, event);
    expect(next.players.p2.inventory.dirt).toBe(2);
  });

  it('applies respawn event', () => {
    const state = initialWorldState();
    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.respawned',
      playerId: 'p3',
      x: 10,
      y: 20,
      hp: 100,
      energy: 80,
    };
    const next = reduce(state, event);
    expect(next.players.p3.x).toBe(10);
    expect(next.players.p3.energy).toBe(80);
  });

  it('ignores tool change when player missing', () => {
    const event: DomainEvent = {
      ...baseEvent,
      type: 'player.changedTool',
      playerId: 'missing',
      tool: 'pickaxe',
    };
    const next = reduce(initialWorldState(), event);
    expect(next.players.missing.currentTool).toBe('pickaxe');
  });
});
