import { CHUNK_H, Material } from '../src/shared/game-types';
import { Terrain } from '../src/world/Terrain';
import type { SolidMaterial } from '../src/shared/protocol';
import { columnFromSampler, computeRemoval } from './world-rules';
import {
  type TileCoord,
  createTileCoord,
  createTileY,
  createPlacementDescriptor,
  createBlockChangeDescriptor,
} from '../src/shared/world-primitives';
import type { BlockChangeDescriptor } from '../src/shared/world-primitives';

function key(coord: TileCoord): string {
  return `${coord.x},${coord.y}`;
}

export interface RemoveResult {
  removed: SolidMaterial;
  descriptors: BlockChangeDescriptor[];
}

export class WorldStore {
  private terrain: Terrain;
  private overrides = new Map<string, Material>();

  constructor(seed: number) {
    this.terrain = new Terrain(seed);
  }

  profileAt(tileX: number) {
    return this.terrain.profileAt(tileX);
  }

  actualMaterial(tileX: number, tileY: number): Material {
    if (tileY < 0 || tileY >= CHUNK_H) return 'air';
    const coord = createTileCoord(tileX, tileY);
    const k = key(coord);
    if (this.overrides.has(k)) {
      return this.overrides.get(k)!;
    }
    return this.terrain.materialAt(tileX, tileY);
  }

  private setMaterial(tileX: number, tileY: number, mat: Material): void {
    if (tileY < 0 || tileY >= CHUNK_H) return;
    const coord = createTileCoord(tileX, tileY);
    const base = this.terrain.materialAt(tileX, tileY);
    const k = key(coord);
    if (mat === base) {
      this.overrides.delete(k);
    } else {
      this.overrides.set(k, mat);
    }
  }

  removeBlockCoord(coord: TileCoord): RemoveResult | null {
    const column = columnFromSampler((y) => this.actualMaterial(coord.x, y));
    const outcome = computeRemoval(column, coord.x, coord.y);
    if (!outcome) return null;

    for (const descriptor of outcome.descriptors) {
      this.setMaterial(descriptor.coord.x, descriptor.coord.y, descriptor.material);
    }

    return { removed: outcome.removed, descriptors: outcome.descriptors };
  }

  removeBlock(tileX: number, tileY: number): RemoveResult | null {
    const coord = createTileCoord(tileX, tileY);
    return this.removeBlockCoord(coord);
  }


  placeBlockCoord(coord: TileCoord, mat: SolidMaterial): BlockChangeDescriptor[] | null {
    const current = this.actualMaterial(coord.x, coord.y);
    if (current !== 'air') return null;

    this.setMaterial(coord.x, coord.y, mat);
    return [createPlacementDescriptor(coord, mat)];
  }

  placeBlock(tileX: number, tileY: number, mat: SolidMaterial): BlockChangeDescriptor[] | null {
    const coord = createTileCoord(tileX, tileY);
    return this.placeBlockCoord(coord, mat);
  }

  setBlock(tileX: number, tileY: number, mat: Material): BlockChangeDescriptor[] {
    if (tileY < 0 || tileY >= CHUNK_H) return [];
    const coord = createTileCoord(tileX, tileY);
    this.setMaterial(coord.x, coord.y, mat);
    return [createBlockChangeDescriptor(coord, mat)];
  }

  snapshotDescriptors(): BlockChangeDescriptor[] {
    return Array.from(this.overrides.entries()).map(([k, mat]) => {
      const [xStr, yStr] = k.split(',');
      const tileX = Number(xStr);
      const tileY = Number(yStr);
      return createBlockChangeDescriptor(createTileCoord(tileX, createTileY(tileY)), mat);
    });
  }

  get terrainSeed(): number {
    return this.terrain.seed;
  }
}
