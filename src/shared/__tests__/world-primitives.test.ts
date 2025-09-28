import { describe, expect, it } from 'vitest';
import {
  asSolidMaterial,
  createBlockChangeDescriptor,
  createRemovalDescriptor,
  createTileCoord,
  createTileX,
  createTileY,
  createPlacementDescriptor,
  descriptorToProtocol,
} from '../world-primitives';
import { CHUNK_H } from '../game-types';

const VALID_X = 42;
const VALID_Y = 10;

describe('tile primitives', () => {
  it('creates branded tile coordinates for valid integers', () => {
    const x = createTileX(VALID_X);
    const y = createTileY(VALID_Y);
    const coord = createTileCoord(VALID_X, VALID_Y);

    expect(x).toBe(VALID_X);
    expect(y).toBe(VALID_Y);
    expect(coord).toEqual({ x, y });
    expect(Object.isFrozen(coord)).toBe(true);
  });

  it('rejects non integer tile x', () => {
    expect(() => createTileX(1.5)).toThrowError(
      new RangeError('tile x must be a finite integer'),
    );
  });

  it('rejects non integer tile y', () => {
    expect(() => createTileY(2.3)).toThrowError(
      new RangeError(`tile y must be an integer within [0, ${CHUNK_H})`),
    );
  });

  it('rejects tile y below zero', () => {
    expect(() => createTileY(-1)).toThrowError(
      new RangeError(`tile y must be an integer within [0, ${CHUNK_H})`),
    );
  });

  it('rejects tile y beyond world ceiling', () => {
    expect(() => createTileY(CHUNK_H)).toThrowError(
      new RangeError(`tile y must be an integer within [0, ${CHUNK_H})`),
    );
  });
});

describe('material primitives', () => {
  it('accepts solid materials', () => {
    expect(asSolidMaterial('rock')).toBe('rock');
  });

  it('rejects air as a solid material', () => {
    expect(() => asSolidMaterial('air')).toThrowError(
      new TypeError('material must be solid (not air)'),
    );
  });
});

describe('block change descriptors', () => {
  it('creates immutable descriptors', () => {
    const coord = createTileCoord(VALID_X, VALID_Y);
    const descriptor = createBlockChangeDescriptor(coord, 'rock');

    expect(descriptor.coord).toBe(coord);
    expect(descriptor.material).toBe('rock');
    expect(Object.isFrozen(descriptor)).toBe(true);
  });

  it('creates placement descriptors requiring solid materials', () => {
    const coord = createTileCoord(VALID_X, VALID_Y);
    const placement = createPlacementDescriptor(coord, 'gold');

    expect(placement.material).toBe('gold');
  });

  it('creates removal descriptors that emit air', () => {
    const coord = createTileCoord(VALID_X, VALID_Y);
    const removal = createRemovalDescriptor(coord);

    expect(removal.material).toBe('air');
  });

  it('converts descriptors back to protocol shape', () => {
    const coord = createTileCoord(VALID_X, VALID_Y);
    const descriptor = createBlockChangeDescriptor(coord, 'coal');

    expect(descriptorToProtocol(descriptor)).toEqual({
      tileX: VALID_X,
      tileY: VALID_Y,
      mat: 'coal',
    });
  });
});
