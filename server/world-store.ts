import { CHUNK_H, Material } from '../src/shared/game-types';
import { Terrain } from '../src/world/Terrain';
import type { BlockChange, SolidMaterial } from '../src/shared/protocol';
import { MATERIAL_WEIGHT, MATERIAL_STICKINESS } from '../src/world/Materials';

function key(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

export interface RemoveResult {
  removed: SolidMaterial;
  changes: BlockChange[];
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
    const k = key(tileX, tileY);
    if (this.overrides.has(k)) {
      return this.overrides.get(k)!;
    }
    return this.terrain.materialAt(tileX, tileY);
  }

  private setMaterial(tileX: number, tileY: number, mat: Material): void {
    const base = this.terrain.materialAt(tileX, tileY);
    const k = key(tileX, tileY);
    if (mat === base) {
      this.overrides.delete(k);
    } else {
      this.overrides.set(k, mat);
    }
  }

  removeBlock(tileX: number, tileY: number): RemoveResult | null {
    if (tileY < 0 || tileY >= CHUNK_H) return null;
    const current = this.actualMaterial(tileX, tileY);
    if (current === 'air') return null;

    const changes: BlockChange[] = [];

    this.setMaterial(tileX, tileY, 'air');
    changes.push({ tileX, tileY, mat: 'air' });

    for (let y = tileY - 1; y >= 0; ) {
      const mat = this.actualMaterial(tileX, y);
      if (mat === 'air') {
        y--;
        continue;
      }

      const clusterTop = this.findClusterTop(tileX, y, mat);
      const clusterBottom = y;

      if (!this.clusterShouldFall(tileX, clusterTop, clusterBottom, mat as SolidMaterial)) {
        y = clusterTop - 1;
        continue;
      }

      const removedMats: SolidMaterial[] = [];
      for (let sy = clusterBottom; sy >= clusterTop; sy--) {
        const existing = this.actualMaterial(tileX, sy) as SolidMaterial;
        this.setMaterial(tileX, sy, 'air');
        changes.push({ tileX, tileY: sy, mat: 'air' });
        removedMats.push(existing);
      }

      let destBottom = clusterBottom;
      while (destBottom + 1 < CHUNK_H && this.actualMaterial(tileX, destBottom + 1) === 'air') {
        destBottom++;
      }

      for (let offset = 0; offset < removedMats.length; offset++) {
        const targetY = destBottom - offset;
        const material = removedMats[offset];
        this.setMaterial(tileX, targetY, material);
        changes.push({ tileX, tileY: targetY, mat: material });
      }

      y = clusterTop - 1;
    }

    return { removed: current as SolidMaterial, changes };
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

  placeBlock(tileX: number, tileY: number, mat: SolidMaterial): BlockChange[] | null {
    if (tileY < 0 || tileY >= CHUNK_H) return null;
    const current = this.actualMaterial(tileX, tileY);
    if (current !== 'air') return null;

    this.setMaterial(tileX, tileY, mat);
    return [{ tileX, tileY, mat }];
  }

  setBlock(tileX: number, tileY: number, mat: Material): BlockChange[] {
    if (tileY < 0 || tileY >= CHUNK_H) return [];
    this.setMaterial(tileX, tileY, mat);
    return [{ tileX, tileY, mat }];
  }

  snapshot(): BlockChange[] {
    return Array.from(this.overrides.entries()).map(([k, mat]) => {
      const [xStr, yStr] = k.split(',');
      return { tileX: Number(xStr), tileY: Number(yStr), mat };
    });
  }

  get terrainSeed(): number {
    return this.terrain.seed;
  }
}
