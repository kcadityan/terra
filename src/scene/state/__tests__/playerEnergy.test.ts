import { describe, expect, it } from 'vitest';
import { advanceEnergy, type EnergyState } from '../playerEnergy';

const baseState: EnergyState = {
  energy: 100,
  hp: 100,
  accumMoveMs: 0,
  accumIdleMs: 0,
};

describe('advanceEnergy', () => {
  it('drains energy while moving', () => {
    const result = advanceEnergy(baseState, {
      moving: true,
      mining: false,
      deltaMs: 2000,
      drainFactor: 1,
    });
    expect(result.energy).toBeLessThan(100);
    expect(result.accumMoveMs).toBeLessThan(1000);
  });

  it('regenerates energy while idle', () => {
    const lowEnergy: EnergyState = { ...baseState, energy: 50 };
    const result = advanceEnergy(lowEnergy, {
      moving: false,
      mining: false,
      deltaMs: 3000,
      drainFactor: 1,
    });
    expect(result.energy).toBeGreaterThan(50);
  });

  it('stops regen while mining', () => {
    const lowEnergy: EnergyState = { ...baseState, energy: 50 };
    const result = advanceEnergy(lowEnergy, {
      moving: false,
      mining: true,
      deltaMs: 3000,
      drainFactor: 1,
    });
    expect(result.energy).toBe(50);
  });

  it('applies damage when energy depleted', () => {
    const empty: EnergyState = { ...baseState, energy: 0, hp: 80 };
    const result = advanceEnergy(empty, {
      moving: true,
      mining: false,
      deltaMs: 1000,
      drainFactor: 1,
    });
    expect(result.hp).toBeLessThan(80);
  });
});
