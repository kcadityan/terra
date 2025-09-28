import { describe, expect, it } from 'vitest';
import { evaluateMine, evaluatePlace, evaluateShoot } from '../terra-events';
import { WorldStore } from '../../world-store';
import { DEFAULT_SEED } from '../../../src/shared/game-types';
import { createTileCoord } from '../../../src/shared/world-primitives';

function makeWorldWithBlock() {
  const world = new WorldStore(DEFAULT_SEED);
  const coord = createTileCoord(0, 15);
  world.setBlock(coord.x, coord.y, 'rock');
  return { world, coord };
}

describe('evaluateMine', () => {
  it('returns error when tile is air', () => {
    const world = new WorldStore(DEFAULT_SEED);
    const coord = createTileCoord(0, 5);
    const result = evaluateMine(world, { type: 'mine', coord });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('mine-block/invalid');
  });

  it('returns descriptors without mutating world', () => {
    const { world, coord } = makeWorldWithBlock();
    const result = evaluateMine(world, { type: 'mine', coord });
    expect(result.ok).toBe(true);
    expect(result.removal).toBeDefined();
    expect(world.actualMaterial(coord.x, coord.y)).toBe('rock');
  });
});

describe('evaluatePlace', () => {
  it('requires inventory', () => {
    const world = new WorldStore(DEFAULT_SEED);
    const coord = createTileCoord(2, 8);
    const result = evaluatePlace(world, {
      type: 'place',
      coord,
      material: 'wood',
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
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('place-block/empty');
  });

  it('returns descriptors when placement is valid', () => {
    const world = new WorldStore(DEFAULT_SEED);
    const coord = createTileCoord(3, 12);
    const result = evaluatePlace(world, {
      type: 'place',
      coord,
      material: 'wood',
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
    });
    expect(result.ok).toBe(true);
    expect(result.descriptors).toHaveLength(1);
    expect(world.actualMaterial(coord.x, coord.y)).toBe('air');
  });
});

describe('evaluateShoot', () => {
  it('enforces cooldown', () => {
    const now = Date.now();
    const result = evaluateShoot({ type: 'shoot', now, lastShotAt: now - 100, cooldownMs: 500 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('shoot/cooldown');
  });

  it('allows firing when cooldown elapsed', () => {
    const now = Date.now();
    const result = evaluateShoot({ type: 'shoot', now, lastShotAt: now - 1000, cooldownMs: 500 });
    expect(result.ok).toBe(true);
  });
});
