import { describe, expect, it } from 'vitest';
import {
  applyMineAction,
  evaluatePlacementAction,
  type MineState,
} from '../actions';

const baseMineState: MineState = {
  tool: 'pickaxe',
  lastMiningTool: 'shovel',
  target: null,
};

describe('applyMineAction', () => {
  it('starts a new target and decrements strikes', () => {
    const result = applyMineAction(baseMineState, { tileX: 1, tileY: 2, material: 'rock' });
    expect(result.request).toBeNull();
    expect(result.state.target).not.toBeNull();
    expect(result.state.target?.tileX).toBe(1);
    expect(result.state.target?.strikesLeft).toBeGreaterThanOrEqual(0);
    expect(result.strikesConsumed).toBe(1);
  });

  it('completes mining when strikes reach zero', () => {
    const state: MineState = {
      tool: 'pickaxe',
      lastMiningTool: 'pickaxe',
      target: { tileX: 3, tileY: 4, material: 'rock', strikesLeft: 1 },
    };
    const result = applyMineAction(state, { tileX: 3, tileY: 4, material: 'rock' });
    expect(result.request).toEqual({ tileX: 3, tileY: 4 });
    expect(result.state.target).toBeNull();
  });

  it('ignores mining when tool is rifle', () => {
    const rifleState: MineState = { ...baseMineState, tool: 'rifle' };
    const result = applyMineAction(rifleState, { tileX: 0, tileY: 0, material: 'rock' });
    expect(result.request).toBeNull();
    expect(result.state).toBe(rifleState);
  });
});

describe('evaluatePlacementAction', () => {
  it('rejects when no selection', () => {
    const result = evaluatePlacementAction({ selectedMat: null, inventory: {} }, 0, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('place-block/no-selection');
  });

  it('rejects when inventory empty', () => {
    const result = evaluatePlacementAction({
      selectedMat: 'wood',
      inventory: { grass: 0, dirt: 0, rock: 0, wood: 0, coal: 0, copper: 0, silver: 0, gold: 0, diamond: 0 },
    }, 1, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('place-block/empty');
  });

  it('approves placement and returns request', () => {
    const result = evaluatePlacementAction({
      selectedMat: 'wood',
      inventory: { grass: 0, dirt: 0, rock: 0, wood: 2, coal: 0, copper: 0, silver: 0, gold: 0, diamond: 0 },
    }, 2, 3);
    expect(result.ok).toBe(true);
    expect(result.request).toEqual({ tileX: 2, tileY: 3, material: 'wood' });
  });
});
