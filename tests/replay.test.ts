import { describe, expect, it } from 'vitest';
import { reduce } from '../engine/kernel/reducer';
import { initialWorldState } from '../engine/kernel/state';
import type { DomainEvent } from '../engine/kernel/events';
import { applyMineAction, evaluatePlacementAction, type MineState } from '../src/scene/state/actions';
import { deriveHudState } from '../src/scene/state/hud';
import { initialClientWorldState, reduceClientEvent } from '../src/scene/state/clientWorld';

const baseInventory = {
  grass: 0,
  dirt: 0,
  rock: 0,
  wood: 0,
  coal: 0,
  copper: 0,
  silver: 0,
  gold: 0,
  diamond: 0,
} as const;

describe('event replay between server and client reducers', () => {
  it('keeps server and client in sync for mining and placement sequence', () => {
    const events: DomainEvent[] = [
      {
        id: '1',
        ts: 0,
        type: 'player.mined',
        playerId: 'p1',
        tileX: 1,
        tileY: 2,
        material: 'rock',
      },
      {
        id: '2',
        ts: 0,
        type: 'player.inventoryUpdated',
        playerId: 'p1',
        inventory: { ...baseInventory, rock: 1 },
      },
      {
        id: '3',
        ts: 1,
        type: 'player.placed',
        playerId: 'p1',
        tileX: 3,
        tileY: 4,
        material: 'rock',
      },
      {
        id: '4',
        ts: 1,
        type: 'player.inventoryUpdated',
        playerId: 'p1',
        inventory: baseInventory,
      },
    ];

    let serverState = initialWorldState();
    let clientState = initialClientWorldState();
    for (const event of events) {
      serverState = reduce(serverState, event);
      switch (event.type) {
        case 'player.mined':
          clientState = reduceClientEvent(clientState, {
            type: 'world-update',
            changes: [{ tileX: event.tileX, tileY: event.tileY, mat: 'air' }],
          });
          break;
        case 'player.placed':
          clientState = reduceClientEvent(clientState, {
            type: 'world-update',
            changes: [{ tileX: event.tileX, tileY: event.tileY, mat: event.material }],
          });
          break;
        case 'player.inventoryUpdated':
          clientState = reduceClientEvent(clientState, {
            type: 'inventory-update',
            inventory: event.inventory,
          });
          break;
      }
    }

    expect(serverState.blocks).toEqual([
      { tileX: 1, tileY: 2, material: 'air' },
      { tileX: 3, tileY: 4, material: 'rock' },
    ]);
    expect(serverState.players.p1?.inventory.rock).toBe(0);
    expect(clientState.blocks.get('1,2')).toBe('air');
    expect(clientState.blocks.get('3,4')).toBe('rock');
    expect(clientState.inventory.rock).toBe(0);

    const mineState: MineState = {
      tool: 'pickaxe',
      lastMiningTool: 'pickaxe',
      target: null,
    };
    const mineResult = applyMineAction(mineState, {
      tileX: 1,
      tileY: 2,
      material: 'rock',
    });
    expect(mineResult.request).toEqual({ tileX: 1, tileY: 2 });

    const placementCounts = { ...baseInventory, rock: 1 };
    const placement = evaluatePlacementAction(
      { selectedMat: 'rock', inventory: placementCounts },
      3,
      4,
    );
    expect(placement.ok).toBe(true);

    const hud = deriveHudState({
      hp: 100,
      energy: 100,
      activeLabel: 'Pickaxe',
      selectedMaterial: 'rock',
      weight: 10,
      speedFactor: 1,
    });
    expect(hud.text).toContain('Active: Pickaxe');
  });
});
