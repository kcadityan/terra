import { CHUNK_H, Material } from '../src/shared/game-types';
import { Terrain } from '../src/world/Terrain';
import type { SolidMaterial } from '../src/shared/protocol';
import { MATERIAL_WEIGHT, MATERIAL_STICKINESS } from '../src/world/Materials';
import {
  type TileCoord,
  createTileCoord,
  createTileY,
  createRemovalDescriptor,
  createPlacementDescriptor,
  createBlockChangeDescriptor,
  descriptorToProtocol,
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
    const current = this.actualMaterial(coord.x, coord.y);
    if (current === 'air') return null;

    const descriptors: BlockChangeDescriptor[] = [];

    this.setMaterial(coord.x, coord.y, 'air');
    descriptors.push(createRemovalDescriptor(coord));

    for (let y = coord.y - 1; y >= 0; ) {
      const mat = this.actualMaterial(coord.x, y);
      if (mat === 'air') {
        y--;
        continue;
      }

      const clusterTop = this.findClusterTop(coord.x, y, mat);
      const clusterBottom = y;

      if (!this.clusterShouldFall(coord.x, clusterTop, clusterBottom, mat as SolidMaterial)) {
        y = clusterTop - 1;
        continue;
      }

      const removedMats: SolidMaterial[] = [];
      for (let sy = clusterBottom; sy >= clusterTop; sy--) {
        const existing = this.actualMaterial(coord.x, sy) as SolidMaterial;
        this.setMaterial(coord.x, sy, 'air');
        const removalCoord = createTileCoord(coord.x, sy);
        descriptors.push(createRemovalDescriptor(removalCoord));
        removedMats.push(existing);
      }

      let destBottom = clusterBottom;
      while (destBottom + 1 < CHUNK_H && this.actualMaterial(coord.x, destBottom + 1) === 'air') {
        destBottom++;
      }

      for (let offset = 0; offset < removedMats.length; offset++) {
        const targetY = destBottom - offset;
        const material = removedMats[offset];
        this.setMaterial(coord.x, targetY, material);
        const placementCoord = createTileCoord(coord.x, targetY);
        descriptors.push(createPlacementDescriptor(placementCoord, material));
      }

      y = clusterTop - 1;
    }

    return { removed: current as SolidMaterial, descriptors };
  }

  removeBlock(tileX: number, tileY: number): RemoveResult | null {
    const coord = createTileCoord(tileX, tileY);
    return this.removeBlockCoord(coord);
  }

  private findClusterTop(tileX: number, startY: number, mat: Material): number {
    let top = startY;
    while (top - 1 >= 0 && this.actualMaterial(tileX, top - 1) === mat) {
      top--;
    }
    return top;
  }

  private clusterShouldFall(tileX: number, topY: number, bottomY: number, mat: SolidMaterial): boolean {
    const stick = MATERIAL_STICKINESS[mat] ?? 0;
    if (stick <= 0) return true;

    const clusterHeight = bottomY - topY + 1;
    const clusterWeight = clusterHeight * (MATERIAL_WEIGHT[mat] ?? 1);

    let weightAbove = 0;
    for (let y = topY - 1; y >= 0; y--) {
      const aboveMat = this.actualMaterial(tileX, y);
      if (aboveMat === 'air') continue;
      weightAbove += MATERIAL_WEIGHT[aboveMat as SolidMaterial] ?? 1;
    }

    return clusterWeight + weightAbove > stick;
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
