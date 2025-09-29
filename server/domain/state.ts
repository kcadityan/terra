import type { SolidMaterial } from '../../src/shared/protocol';
import type { Material, Tool } from '../../src/shared/game-types';

export type PlayerId = string;

export type InventorySnapshot = Record<SolidMaterial, number>;

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
  readonly inventory: InventorySnapshot;
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

export function emptyInventory(): InventorySnapshot {
  return {
    grass: 0,
    dirt: 0,
    rock: 0,
    wood: 0,
    coal: 0,
    copper: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
  };
}

export function defaultPlayerSnapshot(id: PlayerId): PlayerSnapshot {
  return {
    id,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 100,
    energy: 100,
    facing: 1,
    currentTool: 'shovel',
    selectedMat: null,
    inventory: emptyInventory(),
  };
}
