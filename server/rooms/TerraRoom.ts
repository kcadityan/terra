import type { Client } from 'colyseus';
import { createRequire } from 'node:module';
import { nanoid } from 'nanoid';
import {
  type ClientStateMessage,
  type MineBlockMessage,
  type PlaceBlockMessage,
  type PlayerInit,
  type PlayerState,
  type ServerMessage,
  type SolidMaterial,
  type WelcomeMessage,
  type BlockChange,
  type InventoryCounts,
  type ShootMessage,
  type PlayerShotMessage,
} from '../../engine/shared/protocol';
import {
  TILE,
  CHUNK_H,
  DEFAULT_SEED,
  RIFLE_RANGE_BLOCKS,
  RIFLE_COOLDOWN_MS,
  RIFLE_BULLET_SPEED,
  WORLD_GRAVITY,
  RIFLE_BULLET_GRAVITY,
} from '../../engine/shared/game-types';
import { WorldStore } from '../../mods/core/server/world-store';
import { TerraState, PlayerSchema, BlockSchema, serializePlayers } from '../state/TerraState';
import type { TerrainProfile } from '../../mods/core/shared/terrain';
import { createTileCoord, descriptorToProtocol } from '../../engine/shared/world-primitives';
import {
  evaluateMine,
  evaluatePlace,
  evaluateShoot,
  evaluatePlayerJoined,
} from '../../mods/core/server/terra-events';
import { TerraEventBus } from '../events/bus';
import { randomUUID } from 'node:crypto';
import type { Kernel } from '../../engine/kernel';
import type { DomainEvent } from '../../engine/kernel/events';
import type { WorldLog } from '../../engine/kernel/world-log';
import { getServerContext } from '../context';
import { fromMaterialId, toMaterialId } from '../../mods/core/shared/materials';

const PLAYER_ID_LENGTH = 8;
const RIFLE_RANGE = TILE * RIFLE_RANGE_BLOCKS;
const RIFLE_HIT_RADIUS = TILE * 0.8;
const SELF_HIT_MIN_DISTANCE = TILE;
const BULLET_STEP_SECONDS = 1 / 90;

function key(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function createEmptyInventory(): InventoryCounts {
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

const require = createRequire(import.meta.url);
const Colyseus = require('colyseus') as typeof import('colyseus');

export class TerraRoom extends Colyseus.Room<TerraState> {
  private world!: WorldStore;
  private lastShotAt = new Map<string, number>();
  private bus = new TerraEventBus();
  private worldLog!: WorldLog;
  private kernel!: Kernel;

  async onCreate() {
    const { kernel } = getServerContext();
    this.kernel = kernel;
    this.worldLog = kernel.worldLog;
    const seed = DEFAULT_SEED;
    this.world = new WorldStore(seed);
    this.setState(new TerraState(seed));
    await this.worldLog.replay();
    this.setupEventBus();

    this.onMessage<ClientStateMessage>('state', (client, message) => {
      this.handleState(client, message);
    });

    this.onMessage<MineBlockMessage>('mine-block', async (client, message) => {
      await this.handleMine(client, message);
    });

    this.onMessage<PlaceBlockMessage>('place-block', async (client, message) => {
      await this.handlePlace(client, message);
    });

    this.onMessage<ShootMessage>('shoot', async (client, message) => {
      await this.handleShoot(client, message);
    });

    this.onMessage('hello', () => {
      // currently unused; reserved for future metadata
    });
  }

  private setupEventBus() {
    this.bus.on('world-update', ({ descriptors, source }) => {
      this.world.applyDescriptors(descriptors);
      const changes = descriptors.map(descriptorToProtocol);
      this.applyWorldChanges(changes);
      this.broadcastExcept(source ?? null, { type: 'world-update', changes });
    });

    this.bus.on('inventory-update', ({ client, playerId, counts }) => {
      this.sendMessage(client, { type: 'inventory-update', id: playerId, inventory: counts });
    });

    this.bus.on('action-denied', ({ client, reason }) => {
      this.sendMessage(client, { type: 'action-denied', reason });
    });

    this.bus.on('player-shot', ({ payload }) => {
      this.broadcastExcept(null, payload);
    });
  }

  onJoin(client: Client<PlayerInit>) {
    const playerId = nanoid(PLAYER_ID_LENGTH);
    const spawn = this.spawnState(this.state.players.size);
    const player = new PlayerSchema();
    player.id = playerId;
    player.state.setFrom(spawn);
    player.inventory.setFrom(createEmptyInventory());
    this.state.players.set(client.sessionId, player);

    const snapshotDescriptors = evaluatePlayerJoined(this.world);
    const snapshot = snapshotDescriptors.map(descriptorToProtocol);
    this.applyWorldSnapshot(snapshot);

    const welcome: WelcomeMessage = {
      type: 'welcome',
      selfId: playerId,
      seed: this.state.seed,
      players: serializePlayers(this.state),
      world: snapshot,
    };
    this.sendMessage(client, welcome);

    const joined: ServerMessage = {
      type: 'player-joined',
      player: player.toPlayerInit(),
    };
    this.broadcastExcept(client, joined);

    this.lastShotAt.set(client.sessionId, 0);
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const left: ServerMessage = { type: 'player-left', id: player.id };
    this.state.players.delete(client.sessionId);
    this.broadcastExcept(client, left);
    this.lastShotAt.delete(client.sessionId);
  }

  private broadcastExcept(source: Client | null, message: ServerMessage) {
    for (const client of this.clients) {
      if (source && client.sessionId === source.sessionId) continue;
      this.sendMessage(client, message);
    }
  }

  private sendMessage(client: Client, message: ServerMessage) {
    client.send('message', message as unknown as any);
  }

  private handleState(client: Client, message: ClientStateMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.state.merge(message.state);

    const payload: ServerMessage = {
      type: 'player-state',
      id: player.id,
      state: player.state.toJSON(),
    };
    this.broadcastExcept(client, payload);
  }

  private async handleMine(client: Client, message: MineBlockMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    let coord;
    try {
      coord = createTileCoord(message.tileX, message.tileY);
    } catch {
      this.bus.emit('action-denied', { client, reason: 'mine-block/invalid-coord' });
      return;
    }

    const evaluation = evaluateMine(this.world, { type: 'mine', coord });
    if (!evaluation.ok || !evaluation.removal) {
      const reason = evaluation.reason ?? 'mine-block/invalid';
      this.bus.emit('action-denied', { client, reason });
      return;
    }

    const { removal } = evaluation;
    const tool = player.state.currentTool;
    const registry = this.kernel.getRegistry();
    const materialId = toMaterialId(removal.removed);
    const rule = registry.strikeRules.get(tool)?.get(materialId);
    if (!rule || rule.outcome.kind !== 'Removed') {
      this.bus.emit('action-denied', { client, reason: 'mine-block/forbidden' });
      return;
    }

    for (const drop of rule.outcome.drops) {
      const amount = drop.qty;
      const dropMat = fromMaterialId(drop.id) ?? null;
      if (!dropMat) continue;
      player.inventory.add(dropMat, amount);
    }
    const counts = player.inventory.toCounts();

    this.bus.emit('world-update', { descriptors: removal.descriptors });
    this.bus.emit('inventory-update', { client, playerId: player.id, counts });

    await this.appendDomainEvent(
      'player.inventoryUpdated',
      {
        playerId: player.id,
        inventory: counts,
      },
      { roomId: this.roomId, actor: player.id, command: 'mine' },
    );

    await this.appendDomainEvent(
      'player.mined',
      {
        playerId: player.id,
        tileX: message.tileX,
        tileY: message.tileY,
        material: removal.removed,
      },
      { roomId: this.roomId, actor: player.id },
    );
  }

  private async handlePlace(client: Client, message: PlaceBlockMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const mat = message.mat;
    if (!player.inventory.has(mat, 1)) {
      this.sendMessage(client, { type: 'action-denied', reason: 'place-block/empty' });
      return;
    }

    let coord;
    try {
      coord = createTileCoord(message.tileX, message.tileY);
    } catch {
      this.bus.emit('action-denied', { client, reason: 'place-block/invalid-coord' });
      return;
    }

    const evaluation = evaluatePlace(this.world, {
      type: 'place',
      coord,
      material: mat as SolidMaterial,
      inventory: player.inventory.toCounts(),
    });

    if (!evaluation.ok || !evaluation.descriptors) {
      const reason = evaluation.reason ?? 'place-block/occupied';
      this.bus.emit('action-denied', { client, reason });
      return;
    }

    player.inventory.add(mat, -1);
    const counts = player.inventory.toCounts();

    this.bus.emit('world-update', { descriptors: evaluation.descriptors });
    this.bus.emit('inventory-update', { client, playerId: player.id, counts });

    await this.appendDomainEvent(
      'player.inventoryUpdated',
      {
        playerId: player.id,
        inventory: counts,
      },
      { roomId: this.roomId, actor: player.id, command: 'place' },
    );

    await this.appendDomainEvent(
      'player.placed',
      {
        playerId: player.id,
        tileX: message.tileX,
        tileY: message.tileY,
        material: mat,
      },
      { roomId: this.roomId, actor: player.id },
    );
  }

  private async handleShoot(client: Client, message: ShootMessage) {
    const shooter = this.state.players.get(client.sessionId);
    if (!shooter) return;

    const now = Date.now();
    const last = this.lastShotAt.get(client.sessionId);
    const evaluation = evaluateShoot({ type: 'shoot', now, lastShotAt: last, cooldownMs: RIFLE_COOLDOWN_MS });
    if (!evaluation.ok) {
      this.bus.emit('action-denied', { client, reason: evaluation.reason ?? 'shoot/cooldown' });
      return;
    }

    const mag = Math.hypot(message.dirX, message.dirY);
    if (!Number.isFinite(mag) || mag <= 0.0001) return;

    const dirX = message.dirX / mag;
    const dirY = message.dirY / mag;
    const originX = message.originX;
    const originY = message.originY;

    const impact = this.findBulletImpact(shooter, originX, originY, dirX, dirY);
    const hit = impact.player;

    this.lastShotAt.set(client.sessionId, now);

    const payload: PlayerShotMessage = {
      type: 'player-shot',
      shooterId: shooter.id,
      originX,
      originY,
      dirX,
      dirY,
      hitId: hit ? hit.id : null,
    };

    this.bus.emit('player-shot', { payload });

    await this.appendDomainEvent(
      'player.shot',
      {
        shooterId: shooter.id,
        originX,
        originY,
        dirX,
        dirY,
        hitId: payload.hitId,
      },
      { roomId: this.roomId, actor: shooter.id },
    );

    if (impact.block) {
      await this.damageBlock(impact.block.tileX, impact.block.tileY);
    }

    if (hit) {
      hit.state.hp = 0;
      this.broadcastPlayerState(hit);
    }
  }

  private findBulletImpact(
    shooter: PlayerSchema,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
  ): { player: PlayerSchema | null; block: { tileX: number; tileY: number } | null } {
    const speed = RIFLE_BULLET_SPEED;
    const gravity = RIFLE_BULLET_GRAVITY;
    const maxTime = (RIFLE_RANGE / speed) * 2; // generous upper bound accounting for arcs

    let closestPlayer: PlayerSchema | null = null;
    let closestDistance = Infinity;
    let blockHit: { tileX: number; tileY: number } | null = null;

    for (let t = 0; t <= maxTime; t += BULLET_STEP_SECONDS) {
      const x = originX + dirX * speed * t;
      const y = originY + dirY * speed * t + 0.5 * gravity * t * t;
      const travel = Math.hypot(x - originX, y - originY);
      if (travel > RIFLE_RANGE) break;
      if (y > CHUNK_H * TILE || y < -TILE * 8) break;

      const tileX = Math.floor(x / TILE);
      const tileY = Math.floor(y / TILE);
      const mat = this.world.actualMaterial(tileX, tileY);
      if (mat !== 'air') {
        blockHit = { tileX, tileY };
        break;
      }

      this.state.players.forEach((candidate) => {
        const distanceToCandidate = Math.hypot(candidate.state.x - x, candidate.state.y - y);
        if (distanceToCandidate > RIFLE_HIT_RADIUS) return;

        if (candidate.id === shooter.id && travel < SELF_HIT_MIN_DISTANCE) return;

        if (travel < closestDistance) {
          closestPlayer = candidate;
          closestDistance = travel;
        }
      });

      if (closestPlayer) break;
    }

    return { player: closestPlayer, block: blockHit };
  }

  private broadcastPlayerState(player: PlayerSchema) {
    const payload: ServerMessage = {
      type: 'player-state',
      id: player.id,
      state: player.state.toJSON(),
    };
    this.broadcastExcept(null, payload);
  }

  private async damageBlock(tileX: number, tileY: number) {
    const coord = createTileCoord(tileX, tileY);
    const removal = this.world.prepareRemoval(coord);
    if (!removal) return;
    this.bus.emit('world-update', { descriptors: removal.descriptors });
    await this.appendDomainEvent(
      'player.mined',
      {
        playerId: 'environment',
        tileX,
        tileY,
        material: removal.removed,
      },
      { roomId: this.roomId, cause: 'bullet-impact' },
    );
  }

  private spawnState(playerIndex: number): PlayerState {
    const spawnTileX = playerIndex * 4;
    const { groundY }: TerrainProfile = this.world.profileAt(spawnTileX);
    const spawnY = (groundY - 2) * TILE;
    return {
      x: spawnTileX * TILE,
      y: spawnY,
      vx: 0,
      vy: 0,
      hp: 100,
      energy: 100,
      facing: 1,
      currentTool: 'shovel',
      selectedMat: null,
    };
  }

  private createDomainEvent<T extends DomainEvent['type']>(
    type: T,
    payload: Omit<Extract<DomainEvent, { type: T }>, 'id' | 'ts' | 'type'>,
    meta?: Record<string, unknown>,
  ): Extract<DomainEvent, { type: T }> {
    return Object.assign(
      { id: randomUUID(), ts: Date.now(), type, meta } as const,
      payload,
    ) as Extract<DomainEvent, { type: T }>;
  }

  private async appendDomainEvent<T extends DomainEvent['type']>(
    type: T,
    payload: Omit<Extract<DomainEvent, { type: T }>, 'id' | 'ts' | 'type'>,
    meta?: Record<string, unknown>,
  ) {
    const domainEvent = this.createDomainEvent(type, payload, meta);
    try {
      await this.worldLog.append([domainEvent]);
    } catch (err) {
      console.error('[terra] failed to append domain event', err);
    }
  }

  private applyWorldSnapshot(snapshot: BlockChange[]) {
    for (const change of snapshot) {
      const existing = this.state.world.get(key(change.tileX, change.tileY)) ?? new BlockSchema();
      existing.set(change.tileX, change.tileY, change.mat);
      this.state.world.set(key(change.tileX, change.tileY), existing);
    }
  }

  private applyWorldChanges(changes: BlockChange[]) {
    for (const change of changes) {
      const k = key(change.tileX, change.tileY);
      let schema = this.state.world.get(k);
      if (!schema) {
        schema = new BlockSchema();
      }
      schema.set(change.tileX, change.tileY, change.mat);
      this.state.world.set(k, schema);
    }
  }

}
