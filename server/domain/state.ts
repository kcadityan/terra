import type { SolidMaterial } from '../../src/shared/protocol';
import type { Material, Tool } from '../../src/shared/game-types';

export type PlayerId = string;

export interface PlayerSnapshot {
  readonly id: PlayerId;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly hp: number;
  readonly energy: number;
  readonly facing: 1 | -1;
  readonly currentTool: Tool;
  readonly selectedMat: SolidMaterial | null;
  readonly inventory: Record<SolidMaterial, number>;
}

export interface BlockChangeDescriptor {
  readonly tileX: number;
  readonly tileY: number;
  readonly material: Material;
}

export interface WorldState {
  readonly tick: number;
  readonly players: Record<PlayerId, PlayerSnapshot>;
  readonly blocks: BlockChangeDescriptor[];
}

export function initialWorldState(): WorldState {
  return {
    tick: 0,
    players: {},
    blocks: [],
  };
}
