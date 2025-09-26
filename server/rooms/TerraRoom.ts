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
import { TILE, DEFAULT_SEED } from '../../src/shared/game-types';
import { WorldStore } from '../world-store';
import { TerraState, PlayerSchema, BlockSchema, serializePlayers } from '../state/TerraState';
import type { TerrainProfile } from '../../src/world/Terrain';

const PLAYER_ID_LENGTH = 8;
const RIFLE_RANGE = TILE * 25;
const RIFLE_HIT_RADIUS = TILE * 0.8;

function key(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function createEmptyInventory(): InventoryCounts {
  return { grass: 0, dirt: 0, rock: 0, gold: 0 };
}

const require = createRequire(import.meta.url);
const Colyseus = require('colyseus') as typeof import('colyseus');

export class TerraRoom extends Colyseus.Room<TerraState> {
  private world!: WorldStore;

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
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const left: ServerMessage = { type: 'player-left', id: player.id };
    this.state.players.delete(client.sessionId);
    this.broadcastExcept(client, left);
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

    const mag = Math.hypot(message.dirX, message.dirY);
    if (!Number.isFinite(mag) || mag <= 0.0001) return;

    const dirX = message.dirX / mag;
    const dirY = message.dirY / mag;
    const originX = message.originX;
    const originY = message.originY;

    const hit = this.findBulletHit(shooter, originX, originY, dirX, dirY);

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
    let closest: { player: PlayerSchema; distance: number } | null = null;

    this.state.players.forEach((candidate) => {
      if (candidate.id === shooter.id) return;

      const dx = candidate.state.x - originX;
      const dy = candidate.state.y - originY;
      const proj = dx * dirX + dy * dirY;
      if (proj < 0 || proj > RIFLE_RANGE) return;

      const closestX = originX + dirX * proj;
      const closestY = originY + dirY * proj;
      const distSq = (candidate.state.x - closestX) ** 2 + (candidate.state.y - closestY) ** 2;
      if (distSq > RIFLE_HIT_RADIUS * RIFLE_HIT_RADIUS) return;

      if (!closest || proj < closest.distance) {
        closest = { player: candidate, distance: proj };
      }
    });

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
