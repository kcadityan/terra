import { describe, expect, it } from 'vitest';
import { initialWorldState } from '../state';
import {
  validateMine,
  validatePlace,
  validateChangeTool,
  type MineCommand,
  type PlaceCommand,
  type ChangeToolCommand,
} from '../commands';

const basePlayer = {
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
    wood: 1,
    coal: 0,
    copper: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
  },
};
describe('command validation', () => {

  it('rejects mining when player missing', () => {
    const result = validateMine(initialWorldState(), {
      type: 'player.mine.cmd',
      playerId: 'missing',
      tileX: 1,
      tileY: 2,
      material: 'rock',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('mine/player-missing');
  });

  it('produces mining event when valid', () => {
    const state = {
      ...initialWorldState(),
      players: { p1: basePlayer },
    };
    const command: MineCommand = {
      type: 'player.mine.cmd',
      playerId: 'p1',
      tileX: 1,
      tileY: 2,
      material: 'rock',
    };
    const result = validateMine(state, command);
    expect(result.ok).toBe(true);
    if (result.ok && result.event.type === 'player.mined') {
      expect(result.event.playerId).toBe('p1');
      expect(typeof result.event.id).toBe('string');
      expect(typeof result.event.ts).toBe('number');
    }
  });

  it('rejects placement without inventory', () => {
    const state = {
      ...initialWorldState(),
      players: { p1: { ...basePlayer, inventory: { ...basePlayer.inventory, wood: 0 } } },
    };
    const result = validatePlace(state, {
      type: 'player.place.cmd',
      playerId: 'p1',
      tileX: 0,
      tileY: 0,
      material: 'wood',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('place/insufficient-inventory');
  });

  it('produces placement event when valid', () => {
    const state = {
      ...initialWorldState(),
      players: { p1: basePlayer },
    };
    const command: PlaceCommand = {
      type: 'player.place.cmd',
      playerId: 'p1',
      tileX: 5,
      tileY: 6,
      material: 'wood',
    };
    const result = validatePlace(state, command);
    expect(result.ok).toBe(true);
    if (result.ok && result.event.type === 'player.placed') {
      expect(result.event.playerId).toBe('p1');
    }
  });

  it('rejects tool change for missing player', () => {
    const result = validateChangeTool(initialWorldState(), {
      type: 'player.changeTool.cmd',
      playerId: 'missing',
      tool: 'pickaxe',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.type).toBe('tool/player-missing');
  });

  it('produces tool change event when valid', () => {
    const state = {
      ...initialWorldState(),
      players: { p1: basePlayer },
    };
    const command: ChangeToolCommand = {
      type: 'player.changeTool.cmd',
      playerId: 'p1',
      tool: 'pickaxe',
    };
    const result = validateChangeTool(state, command);
    expect(result.ok).toBe(true);
    if (result.ok && result.event.type === 'player.changedTool') {
      expect(result.event.playerId).toBe('p1');
    }
  });
});
