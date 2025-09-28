import { CHUNK_H, Material } from '../src/shared/game-types';
import { Terrain } from '../src/world/Terrain';
import type { SolidMaterial } from '../src/shared/protocol';
import { columnFromSampler, computeRemoval, type RemovalComputation } from './world-rules';
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

  prepareRemoval(coord: TileCoord): RemovalComputation | null {
    const column = columnFromSampler((y) => this.actualMaterial(coord.x, y));
    return computeRemoval(column, coord.x, coord.y);
  }

  applyDescriptors(descriptors: BlockChangeDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.setMaterial(descriptor.coord.x, descriptor.coord.y, descriptor.material);
    }
  }

  removeBlockCoord(coord: TileCoord): RemoveResult | null {
    const outcome = this.prepareRemoval(coord);
    if (!outcome) return null;
    this.applyDescriptors(outcome.descriptors);
    return { removed: outcome.removed, descriptors: outcome.descriptors };
  }

  removeBlock(tileX: number, tileY: number): RemoveResult | null {
    const coord = createTileCoord(tileX, tileY);
    return this.removeBlockCoord(coord);
  }


  preparePlacement(coord: TileCoord, mat: SolidMaterial): BlockChangeDescriptor[] | null {
    const current = this.actualMaterial(coord.x, coord.y);
    if (current !== 'air') return null;
    return [createPlacementDescriptor(coord, mat)];
  }

  placeBlockCoord(coord: TileCoord, mat: SolidMaterial): BlockChangeDescriptor[] | null {
    const descriptors = this.preparePlacement(coord, mat);
    if (!descriptors) return null;
    this.applyDescriptors(descriptors);
    return descriptors;
  }

  placeBlock(tileX: number, tileY: number, mat: SolidMaterial): BlockChangeDescriptor[] | null {
    const coord = createTileCoord(tileX, tileY);
    return this.placeBlockCoord(coord, mat);
  }

  setBlock(tileX: number, tileY: number, mat: Material): BlockChangeDescriptor[] {
    if (tileY < 0 || tileY >= CHUNK_H) return [];
    const coord = createTileCoord(tileX, tileY);
    const descriptor = createBlockChangeDescriptor(coord, mat);
    this.applyDescriptors([descriptor]);
    return [descriptor];
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
