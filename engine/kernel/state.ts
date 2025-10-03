import type { Material, Tool } from '../../engine/shared/game-types';
import type { InventoryCounts, SolidMaterial } from '../../engine/shared/protocol';

export type Tick = number & { readonly _tag: 'Tick' };
export type PlayerId = string & { readonly _tag: 'PlayerId' };
export type InventoryQty = number & { readonly _tag: 'InventoryQty' };

export type InventorySnapshot = Record<SolidMaterial, InventoryQty>;

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

export interface BlockSnapshot {
  readonly tileX: number;
  readonly tileY: number;
  readonly material: Material;
}

export interface WorldState {
  readonly tick: Tick;
  readonly players: Record<PlayerId, PlayerSnapshot>;
  readonly blocks: ReadonlyArray<BlockSnapshot>;
}

export const Tick = {
  zero: 0 as Tick,
  from(value: number): Tick {
    return value as Tick;
  },
  inc(value: Tick): Tick {
    return (value + 1) as Tick;
  },
};

const qty = (n: number): InventoryQty => Math.max(0, Math.round(n)) as InventoryQty;

export const emptyInventory = (): InventorySnapshot => ({
  grass: qty(0),
  dirt: qty(0),
  rock: qty(0),
  wood: qty(0),
  coal: qty(0),
  copper: qty(0),
  silver: qty(0),
  gold: qty(0),
  diamond: qty(0),
});

export const toInventorySnapshot = (counts: InventoryCounts): InventorySnapshot => ({
  grass: qty(counts.grass ?? 0),
  dirt: qty(counts.dirt ?? 0),
  rock: qty(counts.rock ?? 0),
  wood: qty(counts.wood ?? 0),
  coal: qty(counts.coal ?? 0),
  copper: qty(counts.copper ?? 0),
  silver: qty(counts.silver ?? 0),
  gold: qty(counts.gold ?? 0),
  diamond: qty(counts.diamond ?? 0),
});

export const defaultPlayerSnapshot = (id: string): PlayerSnapshot => ({
  id: id as PlayerId,
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
});

export const initialWorldState = (): WorldState => ({
  tick: Tick.zero,
  players: {},
  blocks: [],
});

export const upsertPlayer = (state: WorldState, snapshot: PlayerSnapshot): WorldState => ({
  ...state,
  players: { ...state.players, [snapshot.id]: snapshot },
});

export const pushBlocks = (state: WorldState, blocks: ReadonlyArray<BlockSnapshot>): WorldState => ({
  ...state,
  blocks: state.blocks.concat(blocks),
});

export const withTick = (state: WorldState, tick: Tick): WorldState => ({
  ...state,
  tick,
});
