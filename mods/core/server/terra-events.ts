import type { SolidMaterial, InventoryCounts } from '../../../engine/shared/protocol';
import type { BlockChangeDescriptor, TileCoord } from '../../../engine/shared/world-primitives';
import type { WorldStore } from './world-store';
import type { RemovalComputation } from './world-rules';

export type TerraEvent =
  | { type: 'player-joined' }
  | { type: 'player-left' }
  | MineEvent
  | PlaceEvent
  | ShootEvent;

export interface MineEvent {
  type: 'mine';
  coord: TileCoord;
}

export interface PlaceEvent {
  type: 'place';
  coord: TileCoord;
  material: SolidMaterial;
  inventory: InventoryCounts;
}

export interface ShootEvent {
  type: 'shoot';
  now: number;
  lastShotAt: number | undefined;
  cooldownMs: number;
}

export interface MineEventOutcome {
  ok: boolean;
  reason?: string;
  removal?: RemovalComputation;
}

export interface PlaceEventOutcome {
  ok: boolean;
  reason?: string;
  descriptors?: BlockChangeDescriptor[];
}

export interface ShootEventOutcome {
  ok: boolean;
  reason?: string;
}

export function evaluateMine(world: WorldStore, event: MineEvent): MineEventOutcome {
  const removal = world.prepareRemoval(event.coord);
  if (!removal) {
    return { ok: false, reason: 'mine-block/invalid' };
  }
  return { ok: true, removal };
}

export function evaluatePlace(world: WorldStore, event: PlaceEvent): PlaceEventOutcome {
  if ((event.inventory[event.material] ?? 0) <= 0) {
    return { ok: false, reason: 'place-block/empty' };
  }
  const descriptors = world.preparePlacement(event.coord, event.material);
  if (!descriptors) {
    return { ok: false, reason: 'place-block/occupied' };
  }
  return { ok: true, descriptors };
}

export function evaluateShoot(event: ShootEvent): ShootEventOutcome {
  const { now, lastShotAt, cooldownMs } = event;
  if (typeof lastShotAt === 'number' && now - lastShotAt < cooldownMs) {
    return { ok: false, reason: 'shoot/cooldown' };
  }
  return { ok: true };
}

export function evaluatePlayerJoined(world: WorldStore): BlockChangeDescriptor[] {
  return world.snapshotDescriptors();
}

export function evaluatePlayerLeft(): void {
  // intentionally empty; kept for symmetry with other event handlers
}
