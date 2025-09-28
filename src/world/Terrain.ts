import type { Material } from '../shared/game-types';
import type { SolidMaterial } from '../shared/protocol';
import { valueNoise1D, hash01 } from '../utils/Rand';

interface OreRule {
  mat: SolidMaterial;
  minDepth: number;
  maxDepth: number;
  cellSpan: number;
  clusterChance: number;
  maxRadius: number;
  offset: number;
}

const ORE_RULES: OreRule[] = [
  { mat: 'diamond', minDepth: 22, maxDepth: 58, cellSpan: 48, clusterChance: 0.12, maxRadius: 2, offset: 397 },
  { mat: 'gold', minDepth: 16, maxDepth: 52, cellSpan: 36, clusterChance: 0.18, maxRadius: 3, offset: 211 },
  { mat: 'silver', minDepth: 12, maxDepth: 48, cellSpan: 28, clusterChance: 0.25, maxRadius: 3, offset: 577 },
  { mat: 'copper', minDepth: 6, maxDepth: 42, cellSpan: 20, clusterChance: 0.35, maxRadius: 4, offset: 863 },
  { mat: 'coal', minDepth: 3, maxDepth: 46, cellSpan: 16, clusterChance: 0.45, maxRadius: 4, offset: 109 }
];

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
    if (treeHeight > 0 && worldTileY < groundY) {
      const topY = groundY - treeHeight;
      if (worldTileY === topY) {
        return 'leaf';
      }
      if (worldTileY === topY - 1 && worldTileY >= 0) {
        return 'leaf';
      }
      if (worldTileY > topY && worldTileY < groundY) {
        return 'wood';
      }
    }

    if (worldTileY < groundY) {
      for (let dx = -2; dx <= 2; dx++) {
        const neighborX = worldTileX + dx;
        const neighborProfile = this.profileAt(neighborX);
        const neighborHeight = this.treeHeightAt(neighborX, neighborProfile.groundY);
        if (neighborHeight <= 0) continue;

        const canopyTop = neighborProfile.groundY - neighborHeight;
        if (worldTileY < canopyTop || worldTileY >= neighborProfile.groundY) continue;

        const verticalOffset = worldTileY - canopyTop;
        if (verticalOffset > 1 || verticalOffset < 0) continue;
        if (dx === 0 && verticalOffset > 0) continue;

        const radius = verticalOffset === 0 ? 2 : 1;
        if (Math.abs(dx) <= radius) {
          return 'leaf';
        }
      }
    }

    if (worldTileY < groundY) return 'air';
    if (worldTileY === groundY) return 'grass';

    const depth = worldTileY - groundY;
    if (depth <= 3) return 'dirt';

    const ore = this.sampleOre(worldTileX, worldTileY, depth);
    if (ore) return ore;

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

  private sampleOre(worldTileX: number, worldTileY: number, depth: number): SolidMaterial | null {
    for (const rule of ORE_RULES) {
      if (depth < rule.minDepth || depth > rule.maxDepth) continue;

      const cellX = Math.floor(worldTileX / rule.cellSpan);
      const cellY = Math.floor(worldTileY / rule.cellSpan);
      const clusterSeed = this.seed * 131071 + rule.offset * 17 + cellX * 9289 + cellY * 6263;
      const clusterChance = hash01(clusterSeed, this.seed + rule.offset);
      if (clusterChance > rule.clusterChance) continue;

      const centerX = cellX * rule.cellSpan
        + Math.floor(hash01(clusterSeed + 11, this.seed + rule.offset) * rule.cellSpan);
      const depthRange = Math.max(1, rule.maxDepth - rule.minDepth);
      const centerDepth = rule.minDepth
        + Math.floor(hash01(clusterSeed + 23, this.seed + rule.offset) * depthRange);
      const radius = 1 + Math.floor(hash01(clusterSeed + 41, this.seed + rule.offset) * rule.maxRadius);

      const horizontalDistance = Math.abs(worldTileX - centerX);
      const depthDistance = Math.abs(depth - centerDepth);
      if (horizontalDistance > radius || depthDistance > radius) continue;

      const noise = hash01(worldTileX * 7919 + worldTileY * 1543 + rule.offset, this.seed);
      if (noise < 0.25) continue;

      return rule.mat;
    }
    return null;
  }
}
