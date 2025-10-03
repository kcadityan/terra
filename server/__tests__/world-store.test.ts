import { describe, expect, it } from 'vitest';
import { WorldStore } from '../../mods/core/server/world-store';
import { DEFAULT_SEED, CHUNK_H } from '../../engine/shared/game-types';
import {
  createTileCoord,
  descriptorToProtocol,
} from '../../engine/shared/world-primitives';

function findFirstAirCoord(store: WorldStore, tileX: number) {
  for (let y = 0; y < CHUNK_H; y++) {
    if (store.actualMaterial(tileX, y) === 'air') {
      return createTileCoord(tileX, y);
    }
  }
  throw new Error('expected air tile within search window');
}

describe('WorldStore primitives integration', () => {
  it('removes blocks via TileCoord descriptors', () => {
    const store = new WorldStore(DEFAULT_SEED);
    const target = createTileCoord(0, 10);
    store.setBlock(target.x, target.y, 'rock');

    const result = store.removeBlockCoord(target);
    expect(result).not.toBeNull();
    const descriptors = result!.descriptors;
    expect(descriptors.length).toBeGreaterThan(0);
    const primary = descriptors[0];
    expect(primary.coord).toEqual(target);
    expect(primary.material).toBe('air');

    const payload = descriptors.map(descriptorToProtocol);
    expect(payload[0]).toEqual({ tileX: target.x, tileY: target.y, mat: 'air' });
  });

  it('places blocks via TileCoord descriptors', () => {
    const store = new WorldStore(DEFAULT_SEED);
    const coord = findFirstAirCoord(store, 1);

    const placement = store.placeBlockCoord(coord, 'wood');
    expect(placement).not.toBeNull();
    expect(placement![0].coord).toEqual(coord);
    expect(placement![0].material).toBe('wood');
    expect(store.actualMaterial(coord.x, coord.y)).toBe('wood');
  });

  it('snapshot descriptors mirror overrides', () => {
    const store = new WorldStore(DEFAULT_SEED);
    const coord = createTileCoord(2, 8);
    store.setBlock(coord.x, coord.y, 'gold');

    const snapshot = store.snapshotDescriptors();
    expect(snapshot).toContainEqual(
      expect.objectContaining({ coord, material: 'gold' }),
    );
  });
});
