import { CHUNK_H, Material } from '../src/shared/game-types';
import { Terrain } from '../src/world/Terrain';
import type { BlockChange, SolidMaterial } from '../src/shared/protocol';

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

    return { removed: current as SolidMaterial, changes };
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
