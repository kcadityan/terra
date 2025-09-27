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
} from '../../src/shared/protocol';
import {
  TILE,
  CHUNK_H,
  DEFAULT_SEED,
  RIFLE_RANGE_BLOCKS,
  RIFLE_COOLDOWN_MS,
  RIFLE_BULLET_SPEED,
  WORLD_GRAVITY,
  RIFLE_BULLET_GRAVITY,
} from '../../src/shared/game-types';
import { WorldStore } from '../world-store';
import { TerraState, PlayerSchema, BlockSchema, serializePlayers } from '../state/TerraState';
import type { TerrainProfile } from '../../src/world/Terrain';

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

  onCreate() {
    const seed = DEFAULT_SEED;
    this.world = new WorldStore(seed);
    this.setState(new TerraState(seed));

    this.onMessage<ClientStateMessage>('state', (client, message) => {
      this.handleState(client, message);
    });

    this.onMessage<MineBlockMessage>('mine-block', (client, message) => {
      this.handleMine(client, message);
    });

    this.onMessage<PlaceBlockMessage>('place-block', (client, message) => {
      this.handlePlace(client, message);
    });

    this.onMessage<ShootMessage>('shoot', (client, message) => {
      this.handleShoot(client, message);
    });

    this.onMessage('hello', () => {
      // currently unused; reserved for future metadata
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

    const snapshot = this.world.snapshot();
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

  private handleMine(client: Client, message: MineBlockMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const result = this.world.removeBlock(message.tileX, message.tileY);
    if (!result) {
      this.sendMessage(client, { type: 'action-denied', reason: 'mine-block/invalid' });
      return;
    }

    player.inventory.add(result.removed, 1);

    this.applyWorldChanges(result.changes);

    this.broadcastExcept(null, { type: 'world-update', changes: result.changes });
    this.sendMessage(client, { type: 'inventory-update', id: player.id, inventory: player.inventory.toCounts() });
  }

  private handlePlace(client: Client, message: PlaceBlockMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    const mat = message.mat;
    if (!player.inventory.has(mat, 1)) {
      this.sendMessage(client, { type: 'action-denied', reason: 'place-block/empty' });
      return;
    }

    const placement = this.world.placeBlock(message.tileX, message.tileY, mat as SolidMaterial);
    if (!placement) {
      this.sendMessage(client, { type: 'action-denied', reason: 'place-block/occupied' });
      return;
    }

    player.inventory.add(mat, -1);

    this.applyWorldChanges(placement);

    this.broadcastExcept(null, { type: 'world-update', changes: placement });
    this.sendMessage(client, { type: 'inventory-update', id: player.id, inventory: player.inventory.toCounts() });
  }

  private handleShoot(client: Client, message: ShootMessage) {
    const shooter = this.state.players.get(client.sessionId);
    if (!shooter) return;

    const now = Date.now();
    const last = this.lastShotAt.get(client.sessionId) ?? 0;
    if (now - last < RIFLE_COOLDOWN_MS) {
      this.sendMessage(client, { type: 'action-denied', reason: 'shoot/cooldown' });
      return;
    }

    const mag = Math.hypot(message.dirX, message.dirY);
    if (!Number.isFinite(mag) || mag <= 0.0001) return;

    const dirX = message.dirX / mag;
    const dirY = message.dirY / mag;
    const originX = message.originX;
    const originY = message.originY;

    const hit = this.findBulletHit(shooter, originX, originY, dirX, dirY);

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

    this.broadcastExcept(null, payload);

    if (hit) {
      hit.state.hp = 0;
      this.broadcastPlayerState(hit);
    }
  }

  private findBulletHit(
    shooter: PlayerSchema,
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
  ): PlayerSchema | null {
    const speed = RIFLE_BULLET_SPEED;
    const gravity = RIFLE_BULLET_GRAVITY;
    const maxTime = (RIFLE_RANGE / speed) * 2; // generous upper bound accounting for arcs

    let closest: { player: PlayerSchema; distance: number } | null = null;

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
        this.damageBlock(tileX, tileY);
        break;
      }

      this.state.players.forEach((candidate) => {
        const distanceToCandidate = Math.hypot(candidate.state.x - x, candidate.state.y - y);
        if (distanceToCandidate > RIFLE_HIT_RADIUS) return;

        if (candidate.id === shooter.id && travel < SELF_HIT_MIN_DISTANCE) return;

        if (!closest || travel < closest.distance) {
          closest = { player: candidate, distance: travel };
        }
      });

      if (closest) break;
    }

    return closest ? closest.player : null;
  }

  private broadcastPlayerState(player: PlayerSchema) {
    const payload: ServerMessage = {
      type: 'player-state',
      id: player.id,
      state: player.state.toJSON(),
    };
    this.broadcastExcept(null, payload);
  }

  private damageBlock(tileX: number, tileY: number) {
    const result = this.world.removeBlock(tileX, tileY);
    if (!result) return;
    this.applyWorldChanges(result.changes);
    this.broadcastExcept(null, { type: 'world-update', changes: result.changes });
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
