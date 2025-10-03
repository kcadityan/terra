import { CHUNK_H, type Material } from '../../../engine/shared/game-types';
import type { SolidMaterial } from '../../../engine/shared/protocol';
import {
  createTileCoord,
  createRemovalDescriptor,
  createPlacementDescriptor,
  type BlockChangeDescriptor,
} from '../../../engine/shared/world-primitives';
import { MATERIAL_WEIGHT, MATERIAL_STICKINESS } from '../shared/materials';

export interface RemovalComputation {
  removed: SolidMaterial;
  descriptors: BlockChangeDescriptor[];
  column: Material[];
}

export function columnFromSampler(sampler: (y: number) => Material): Material[] {
  return Array.from({ length: CHUNK_H }, (_, y) => sampler(y));
}

export function computeRemoval(
  column: Material[],
  tileX: number,
  tileY: number,
): RemovalComputation | null {
  if (tileY < 0 || tileY >= CHUNK_H) return null;
  const current = column[tileY];
  if (current === 'air') return null;

  const descriptors: BlockChangeDescriptor[] = [];
  const updated = column.slice();
  updated[tileY] = 'air';
  descriptors.push(createRemovalDescriptor(createTileCoord(tileX, tileY)));

  for (let y = tileY - 1; y >= 0; ) {
    const mat = updated[y];
    if (mat === 'air') {
      y--;
      continue;
    }

    const clusterBottom = y;
    const clusterTop = findClusterTop(updated, y, mat);

    if (!clusterShouldFall(updated, clusterTop, clusterBottom, mat as SolidMaterial)) {
      y = clusterTop - 1;
      continue;
    }

    const removedCluster: SolidMaterial[] = [];
    for (let sy = clusterBottom; sy >= clusterTop; sy--) {
      const existing = updated[sy] as SolidMaterial;
      updated[sy] = 'air';
      removedCluster.push(existing);
      descriptors.push(createRemovalDescriptor(createTileCoord(tileX, sy)));
    }

    let destBottom = clusterBottom;
    while (destBottom + 1 < CHUNK_H && updated[destBottom + 1] === 'air') {
      destBottom++;
    }

    for (let offset = 0; offset < removedCluster.length; offset++) {
      const targetY = destBottom - offset;
      const material = removedCluster[offset];
      updated[targetY] = material;
      descriptors.push(createPlacementDescriptor(createTileCoord(tileX, targetY), material));
    }

    y = clusterTop - 1;
  }

  return { removed: current as SolidMaterial, descriptors, column: updated };
}

function findClusterTop(column: Material[], startY: number, mat: Material): number {
  let top = startY;
  while (top - 1 >= 0 && column[top - 1] === mat) {
    top--;
  }
  return top;
}

function clusterShouldFall(
  column: Material[],
  topY: number,
  bottomY: number,
  mat: SolidMaterial,
): boolean {
  const stick = MATERIAL_STICKINESS[mat] ?? 0;
  if (stick <= 0) return true;

  const clusterHeight = bottomY - topY + 1;
  const clusterWeight = clusterHeight * (MATERIAL_WEIGHT[mat] ?? 1);

  let weightAbove = 0;
  for (let y = topY - 1; y >= 0; y--) {
    const above = column[y];
    if (above === 'air') continue;
    weightAbove += MATERIAL_WEIGHT[above as SolidMaterial] ?? 1;
  }

  return clusterWeight + weightAbove > stick;
}
