import { CHUNK_H, type Material } from './game-types';
import type { SolidMaterial } from './protocol';

export type TileX = number & { readonly __brand: 'TileX' };
export type TileY = number & { readonly __brand: 'TileY' };

export interface TileCoord {
  readonly x: TileX;
  readonly y: TileY;
}

export interface BlockChangeDescriptor {
  readonly coord: TileCoord;
  readonly material: Material;
}

const TILE_X_ERROR = 'tile x must be a finite integer';
const TILE_Y_ERROR = `tile y must be an integer within [0, ${CHUNK_H})`;
const SOLID_MATERIAL_ERROR = 'material must be solid (not air)';

function assertInteger(value: number, errorMessage: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new RangeError(errorMessage);
  }
}

export function createTileX(value: number): TileX {
  assertInteger(value, TILE_X_ERROR);
  return value as TileX;
}

export function createTileY(value: number): TileY {
  assertInteger(value, TILE_Y_ERROR);
  if (value < 0 || value >= CHUNK_H) {
    throw new RangeError(TILE_Y_ERROR);
  }
  return value as TileY;
}

export function createTileCoord(x: number, y: number): TileCoord {
  const coord: TileCoord = Object.freeze({
    x: createTileX(x),
    y: createTileY(y),
  });
  return coord;
}

export function asSolidMaterial(material: Material): SolidMaterial {
  if (material === 'air') {
    throw new TypeError(SOLID_MATERIAL_ERROR);
  }
  return material as SolidMaterial;
}

export function createBlockChangeDescriptor(
  coord: TileCoord,
  material: Material,
): BlockChangeDescriptor {
  const descriptor: BlockChangeDescriptor = Object.freeze({ coord, material });
  return descriptor;
}

export function createPlacementDescriptor(
  coord: TileCoord,
  material: SolidMaterial,
): BlockChangeDescriptor {
  return createBlockChangeDescriptor(coord, material);
}

export function createRemovalDescriptor(coord: TileCoord): BlockChangeDescriptor {
  return createBlockChangeDescriptor(coord, 'air');
}

export function isTileCoord(value: unknown): value is TileCoord {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { x?: number; y?: number };
  return (
    typeof candidate.x === 'number' &&
    Number.isInteger(candidate.x) &&
    typeof candidate.y === 'number' &&
    Number.isInteger(candidate.y) &&
    candidate.y >= 0 &&
    candidate.y < CHUNK_H
  );
}

export function descriptorToProtocol(
  descriptor: BlockChangeDescriptor,
): { tileX: number; tileY: number; mat: Material } {
  return {
    tileX: descriptor.coord.x,
    tileY: descriptor.coord.y,
    mat: descriptor.material,
  };
}
