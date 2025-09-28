import { describe, expect, it } from 'vitest';
import { computeRemoval, columnFromSampler } from '../world-rules';
import { CHUNK_H, type Material } from '../../src/shared/game-types';

function columnWithSurface(): Material[] {
  const column = Array<Material>(CHUNK_H).fill('air');
  column[15] = 'grass';
  for (let y = 16; y < CHUNK_H; y++) {
    column[y] = 'rock';
  }
  return column;
}

describe('computeRemoval', () => {
  it('returns null when removing air', () => {
    const column = columnWithSurface();
    column[10] = 'air';
    const result = computeRemoval(column, 0, 10);
    expect(result).toBeNull();
  });

  it('produces descriptors including removal and settling', () => {
    const column = columnWithSurface();
    const before = [...column];
    const result = computeRemoval(column, 2, 15);
    expect(result).not.toBeNull();
    const descriptors = result!.descriptors;
    expect(descriptors[0].material).toBe('air');
    const changed = result!.column.some((mat, idx) => mat !== before[idx]);
    expect(changed).toBe(true);
    expect(result!.column[15]).toBe('air');
  });

  it('supports custom material samplers via columnFromSampler', () => {
    const sampler = (y: number) => (y < 20 ? 'air' : 'rock');
    const column = columnFromSampler(sampler);
    const result = computeRemoval(column, 1, 20);
    expect(result).not.toBeNull();
    expect(result!.removed).toBe('rock');
  });
});
