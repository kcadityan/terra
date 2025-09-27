import type { Material } from '../shared/game-types';
import { valueNoise1D, hash01 } from '../utils/Rand';

export interface TerrainProfile {
  groundY: number; // surface tile Y
}

export class Terrain {
  seed: number;
  constructor(seed = 1337) { this.seed = seed; }

  profileAt(worldTileX: number): TerrainProfile {
    const n = valueNoise1D(worldTileX, this.seed, 0.03);
    const groundY = Math.floor(12 + n * 10); // between ~12..22
    return { groundY };
  }

  materialAt(worldTileX: number, worldTileY: number): Material {
    const { groundY } = this.profileAt(worldTileX);
    const treeHeight = this.treeHeightAt(worldTileX, groundY);

    if (treeHeight > 0 && worldTileY < groundY && worldTileY >= groundY - treeHeight) {
      return 'wood';
    }

    if (worldTileY < groundY) return 'air';
    if (worldTileY === groundY) return 'grass';

    const depth = worldTileY - groundY;
    if (depth <= 3) return 'dirt';

    const sample = hash01(worldTileX * 131 + worldTileY * 719, this.seed);

    if (depth <= 6) {
      if (sample > 0.92) return 'copper';
      if (sample > 0.82) return 'coal';
    } else if (depth <= 14) {
      if (sample > 0.97) return 'silver';
      if (sample > 0.92) return 'gold';
      if (sample > 0.85) return 'coal';
      if (sample > 0.8) return 'copper';
    } else {
      if (sample > 0.985) return 'diamond';
      if (sample > 0.95) return 'silver';
      if (sample > 0.9) return 'gold';
      if (sample > 0.85) return 'copper';
    }

    return 'rock';
  }

  private treeHeightAt(worldTileX: number, groundY: number): number {
    const left = this.profileAt(worldTileX - 1).groundY;
    const right = this.profileAt(worldTileX + 1).groundY;
    if (Math.abs(left - groundY) > 1 || Math.abs(right - groundY) > 1) return 0;

    const base = hash01(worldTileX * 911 + this.seed * 131, this.seed + 57);
    if (base < 0.965) return 0;

    const variant = hash01(worldTileX * 577 + this.seed * 311, this.seed + 409);
    return 3 + Math.floor(variant * 3);
  }
}
