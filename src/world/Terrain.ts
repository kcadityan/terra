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
    if (worldTileY < groundY) return 'air';
    if (worldTileY === groundY) return 'grass';

    const depth = worldTileY - groundY;
    if (depth <= 3) return 'dirt';

    if (depth >= 5) {
      const p = hash01(worldTileX * 131 + worldTileY * 719, this.seed);
      if (p > 0.985) return 'gold';
    }
    return 'rock';
  }
}
