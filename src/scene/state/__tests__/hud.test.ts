import { describe, expect, it } from 'vitest';
import { deriveHudState } from '../hud';

describe('deriveHudState', () => {
  it('computes fractions and text', () => {
    const hud = deriveHudState({
      hp: 75,
      energy: 50,
      activeLabel: 'Pickaxe',
      selectedMaterial: 'rock',
      weight: 42,
      speedFactor: 0.8,
    });

    expect(hud.text).toContain('HP: 75');
    expect(hud.text).toContain('Energy: 50');
    expect(hud.text).toContain('Active: Pickaxe');
    expect(hud.text).toContain('Block: rock');
    expect(hud.text).toContain('Weight: 42');
    expect(hud.text).toContain('Speed: 80%');
    expect(hud.hpFraction).toBeCloseTo(0.75);
    expect(hud.energyFraction).toBeCloseTo(0.5);
  });

  it('clamps fractions', () => {
    const hud = deriveHudState({
      hp: 150,
      energy: -50,
      activeLabel: 'Shovel',
      selectedMaterial: null,
      weight: 0,
      speedFactor: 1.5,
    });

    expect(hud.hpFraction).toBe(1);
    expect(hud.energyFraction).toBe(0);
    expect(hud.text).toContain('Block: —');
    expect(hud.text).toContain('Speed: 150%');
  });
});
