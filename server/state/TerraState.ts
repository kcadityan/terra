import { Schema, MapSchema, type } from '@colyseus/schema';
import type { InventoryCounts, PlayerInit, PlayerState, SolidMaterial } from '../../src/shared/protocol';
import type { Material } from '../../src/shared/game-types';

export class InventorySchema extends Schema {
  @type('number') grass = 0;
  @type('number') dirt = 0;
  @type('number') rock = 0;
  @type('number') gold = 0;

  setFrom(inventory: InventoryCounts) {
    this.grass = inventory.grass;
    this.dirt = inventory.dirt;
    this.rock = inventory.rock;
    this.gold = inventory.gold;
  }

  add(mat: SolidMaterial, amount: number) {
    const next = (this as unknown as InventoryCounts)[mat] + amount;
    (this as unknown as InventoryCounts)[mat] = Math.max(0, next);
  }

  has(mat: SolidMaterial, amount: number) {
    return (this as unknown as InventoryCounts)[mat] >= amount;
  }

  toCounts(): InventoryCounts {
    return {
      grass: this.grass,
      dirt: this.dirt,
      rock: this.rock,
      gold: this.gold,
    };
  }
}

export class PlayerStateSchema extends Schema implements PlayerState {
  @type('number') x = 0;
  @type('number') y = 0;
  @type('number') vx = 0;
  @type('number') vy = 0;
  @type('number') hp = 100;
  @type('number') energy = 100;
  @type('int8') facing: 1 | -1 = 1;
  @type('string') currentTool: PlayerState['currentTool'] = 'shovel';
  @type('string') selectedMat: SolidMaterial | null = null;

  setFrom(state: PlayerState) {
    this.x = state.x;
    this.y = state.y;
    this.vx = state.vx;
    this.vy = state.vy;
    this.hp = state.hp;
    this.energy = state.energy;
    this.facing = state.facing;
    this.currentTool = state.currentTool;
    this.selectedMat = state.selectedMat;
  }

  merge(state: Partial<PlayerState>) {
    if (state.x !== undefined) this.x = state.x;
    if (state.y !== undefined) this.y = state.y;
    if (state.vx !== undefined) this.vx = state.vx;
    if (state.vy !== undefined) this.vy = state.vy;
    if (state.hp !== undefined) this.hp = state.hp;
    if (state.energy !== undefined) this.energy = state.energy;
    if (state.facing !== undefined) this.facing = state.facing;
    if (state.currentTool !== undefined) this.currentTool = state.currentTool;
    if (state.selectedMat !== undefined) this.selectedMat = state.selectedMat;
  }

}

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type(PlayerStateSchema) state = new PlayerStateSchema();
  @type(InventorySchema) inventory = new InventorySchema();

  toPlayerInit(): PlayerInit {
    return {
      id: this.id,
      state: this.state.toJSON(),
      inventory: this.inventory.toCounts(),
    };
  }
}

export class BlockSchema extends Schema {
  @type('number') tileX = 0;
  @type('number') tileY = 0;
  @type('string') mat: Material = 'air';

  set(tileX: number, tileY: number, mat: Material) {
    this.tileX = tileX;
    this.tileY = tileY;
    this.mat = mat;
  }
}

export class TerraState extends Schema {
  @type('number') seed = 0;
  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ map: BlockSchema }) world = new MapSchema<BlockSchema>();

  constructor(seed: number) {
    super();
    this.seed = seed;
  }
}

export function serializePlayers(state: TerraState): PlayerInit[] {
  const list: PlayerInit[] = [];
  state.players.forEach((player) => {
    list.push(player.toPlayerInit());
  });
  return list;
}
