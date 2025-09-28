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
  type NPCState,
  type TimeOfDayInfo,
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
  type Material,
} from '../../src/shared/game-types';
import { WorldStore } from '../world-store';
import { TerraState, PlayerSchema, BlockSchema, serializePlayers } from '../state/TerraState';
import type { TerrainProfile } from '../../src/world/Terrain';

const PLAYER_ID_LENGTH = 8;
const RIFLE_RANGE = TILE * RIFLE_RANGE_BLOCKS;
const RIFLE_HIT_RADIUS = TILE * 0.8;
const SELF_HIT_MIN_DISTANCE = TILE;
const BULLET_STEP_SECONDS = 1 / 90;
const NPC_SPEED = 80;
const NPC_ATTACK_COOLDOWN_MS = 1200;
const NPC_ATTACK_DAMAGE = 9999;
const NPC_SHOT_COOLDOWN_MS = 2000;
const NPC_SHOT_DAMAGE = 9999;
const NPC_SHOT_RANGE = TILE * 18;
const NPC_COUNT = 4;
const DAY_NIGHT_CYCLE_MS = 6 * 60 * 1000;
const HALF_CYCLE_MS = DAY_NIGHT_CYCLE_MS / 2;
const NPC_FALL_SPEED = 420;
const BLOCK_CURRENCY_VALUE: Partial<Record<SolidMaterial, number>> = {
  coal: 10,
  copper: 25,
  silver: 60,
  gold: 100,
  diamond: 250,
};

function isPassable(mat: Material): boolean {
  return mat === 'air' || mat === 'leaf';
}

function isSolid(mat: Material): boolean {
  return !isPassable(mat);
}

function key(tileX: number, tileY: number): string {
  return `${tileX},${tileY}`;
}

function createEmptyInventory(): InventoryCounts {
  return {
    grass: 0,
    dirt: 0,
    rock: 0,
    wood: 0,
    leaf: 0,
    coal: 0,
    copper: 0,
    silver: 0,
    gold: 0,
    diamond: 0,
  };
}

const require = createRequire(import.meta.url);
const Colyseus = require('colyseus') as typeof import('colyseus');

interface NpcEntity {
  id: string;
  x: number;
  y: number;
  hp: number;
  lastAttack: number;
  lastShot: number;
  wanderDir: -1 | 0 | 1;
  wanderSwitchAt: number;
}

interface DepositRecord {
  playerId: string;
  mat: SolidMaterial;
  placedAt: number;
}

type BulletHit =
  | { kind: 'player'; player: PlayerSchema }
  | { kind: 'npc'; npc: NpcEntity };

interface BulletTraceResult {
  hit: BulletHit | null;
  travel: number;
}

interface TraceOptions {
  excludePlayerId?: string;
  excludeNpcId?: string;
  breaksBlocks?: boolean;
}

export class TerraRoom extends Colyseus.Room<TerraState> {
  private world!: WorldStore;
  private lastShotAt = new Map<string, number>();
  private npcs = new Map<string, NpcEntity>();
  private playerClients = new Map<string, Client>();
  private cycleStart = Date.now();
  private isNight = false;
  private deposits = new Map<string, DepositRecord>();

  onCreate() {
    const seed = DEFAULT_SEED;
    this.world = new WorldStore(seed);
    this.setState(new TerraState(seed));
    this.cycleStart = Date.now();
    this.isNight = false;

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

    this.spawnInitialNPCs();
    this.clock.setInterval(() => this.tickNPCs(0.1), 100);
    this.clock.setInterval(() => {
      this.tickTimeOfDay();
      this.tickDeposits();
    }, 1000);
  }

  onJoin(client: Client<PlayerInit>) {
    const playerId = nanoid(PLAYER_ID_LENGTH);
    const spawn = this.spawnState(this.state.players.size);
    const player = new PlayerSchema();
    player.id = playerId;
    player.state.setFrom(spawn);
    player.inventory.setFrom(createEmptyInventory());
    this.state.players.set(client.sessionId, player);
    this.playerClients.set(playerId, client);

    const snapshot = this.world.snapshot();
    this.applyWorldSnapshot(snapshot);

    const welcome: WelcomeMessage = {
      type: 'welcome',
      selfId: playerId,
      seed: this.state.seed,
      players: serializePlayers(this.state),
      world: snapshot,
      timeOfDay: this.currentTimeOfDayInfo(),
    };
    this.sendMessage(client, welcome);

    const joined: ServerMessage = {
      type: 'player-joined',
      player: player.toPlayerInit(),
    };
    this.broadcastExcept(client, joined);

    this.lastShotAt.set(client.sessionId, 0);

    this.npcs.forEach((npc) => {
      this.sendMessage(client, { type: 'npc-spawn', npc: this.serializeNpc(npc) });
    });
    this.sendMessage(client, { type: 'time-of-day', info: this.currentTimeOfDayInfo() });
  }

  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const left: ServerMessage = { type: 'player-left', id: player.id };
    this.state.players.delete(client.sessionId);
    this.broadcastExcept(client, left);
    this.lastShotAt.delete(client.sessionId);
    this.playerClients.delete(player.id);
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

  private sendToPlayer(playerId: string, message: ServerMessage) {
    const client = this.playerClients.get(playerId);
    if (client) this.sendMessage(client, message);
  }

  private handleState(client: Client, message: ClientStateMessage) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    player.state.merge(message.state);

    if (player.state.hp <= 0 || player.state.energy <= 0) {
      this.handlePlayerDeath(player);
      return;
    }

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
    this.updateDepositsForChanges(result.changes);

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
    this.updateDepositsForChanges(placement, player.id);

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

    const trace = this.traceBullet(originX, originY, dirX, dirY, {
      excludePlayerId: shooter.id,
      breaksBlocks: false,
    });
    const hit = trace.hit;

    this.lastShotAt.set(client.sessionId, now);

    const payload: PlayerShotMessage = {
      type: 'player-shot',
      shooterId: shooter.id,
      originX,
      originY,
      dirX,
      dirY,
      hitId: hit && hit.kind === 'player' ? hit.player.id : null,
      hitNpcId: hit && hit.kind === 'npc' ? hit.npc.id : null,
      distance: trace.travel,
    };

    this.broadcastExcept(null, payload);

    if (hit?.kind === 'player') {
      this.damagePlayer(hit.player, 9999);
    } else if (hit?.kind === 'npc') {
      this.damageNpc(hit.npc, 9999);
    }
  }

  private traceBullet(
    originX: number,
    originY: number,
    dirX: number,
    dirY: number,
    options: TraceOptions = {},
  ): BulletTraceResult {
    const { excludePlayerId, excludeNpcId, breaksBlocks = true } = options;
    const speed = RIFLE_BULLET_SPEED;
    const gravity = RIFLE_BULLET_GRAVITY;
    const maxTime = (RIFLE_RANGE / speed) * 2; // generous upper bound accounting for arcs

    let lastTravel = 0;

    for (let t = 0; t <= maxTime; t += BULLET_STEP_SECONDS) {
      const x = originX + dirX * speed * t;
      const y = originY + dirY * speed * t + 0.5 * gravity * t * t;
      const travel = Math.hypot(x - originX, y - originY);
      lastTravel = travel;
      if (travel > RIFLE_RANGE) break;
      if (y > CHUNK_H * TILE || y < -TILE * 8) break;

      const tileX = Math.floor(x / TILE);
      const tileY = Math.floor(y / TILE);
      const mat = this.world.actualMaterial(tileX, tileY);
      if (mat !== 'air') {
        if (breaksBlocks) this.damageBlock(tileX, tileY);
        return { hit: null, travel };
      }

      for (const candidate of this.state.players.values()) {
        const distanceToCandidate = Math.hypot(candidate.state.x - x, candidate.state.y - y);
        if (distanceToCandidate > RIFLE_HIT_RADIUS) continue;
        if (excludePlayerId && candidate.id === excludePlayerId && travel < SELF_HIT_MIN_DISTANCE) continue;
        if (excludePlayerId && candidate.id === excludePlayerId) continue;
        return { hit: { kind: 'player', player: candidate }, travel };
      }

      for (const npc of this.npcs.values()) {
        const distanceToNpc = Math.hypot(npc.x - x, npc.y - y);
        if (distanceToNpc > RIFLE_HIT_RADIUS) continue;
        if (excludeNpcId && npc.id === excludeNpcId) continue;
        return { hit: { kind: 'npc', npc }, travel };
      }
    }

    const travel = lastTravel > 0 ? Math.min(lastTravel, RIFLE_RANGE) : RIFLE_RANGE;
    return { hit: null, travel };
  }

  private broadcastPlayerState(player: PlayerSchema) {
    const payload: ServerMessage = {
      type: 'player-state',
      id: player.id,
      state: player.state.toJSON(),
    };
    this.broadcastExcept(null, payload);
  }

  private damageBlock(tileX: number, tileY: number): boolean {
    const result = this.world.removeBlock(tileX, tileY);
    if (!result) return false;
    this.applyWorldChanges(result.changes);
    this.updateDepositsForChanges(result.changes);
    this.broadcastExcept(null, { type: 'world-update', changes: result.changes });
    return true;
  }

  private spawnInitialNPCs() {
    if (!this.isNight) return;
    this.ensureNpcPopulation();
  }

  private spawnNpc() {
    if (!this.isNight) return;
    if (this.npcs.size >= NPC_COUNT) return;
    const id = nanoid(10);
    const tileX = Math.floor((Math.random() - 0.5) * 200);
    const groundTile = this.findTopSolidTile(tileX) ?? this.world.profileAt(tileX).groundY;
    const x = tileX * TILE + TILE / 2;
    const y = groundTile * TILE;
    const now = Date.now();
    const npc: NpcEntity = {
      id,
      x,
      y,
      hp: 100,
      lastAttack: 0,
      lastShot: 0,
      wanderDir: Math.random() < 0.5 ? -1 : 1,
      wanderSwitchAt: now + 2000 + Math.random() * 3000,
    };
    this.npcs.set(id, npc);
    this.broadcastExcept(null, { type: 'npc-spawn', npc: this.serializeNpc(npc) });
  }

  private ensureNpcPopulation() {
    while (this.isNight && this.npcs.size < NPC_COUNT) {
      this.spawnNpc();
    }
  }

  private clearNpcs() {
    for (const npc of this.npcs.values()) {
      this.broadcastExcept(null, { type: 'npc-remove', id: npc.id });
    }
    this.npcs.clear();
  }

  private tickNPCs(dt: number) {
    if (!this.isNight) return;
    const now = Date.now();
    this.npcs.forEach((npc) => {
      const target = this.findClosestPlayer(npc);
      const px = target?.state.x ?? npc.x;
      const py = target?.state.y ?? npc.y;
      const dx = px - npc.x;
      const dy = py - npc.y;
      const dist = target ? Math.hypot(dx, dy) || 1 : Infinity;
      const speed = NPC_SPEED;
      const tileX = Math.floor(npc.x / TILE);
      const targetGroundTile = this.findTopSolidTile(tileX);

      if (targetGroundTile === null) {
        npc.y += NPC_FALL_SPEED * dt;
      } else {
        const targetGroundPixel = targetGroundTile * TILE;
        if (npc.y < targetGroundPixel) {
          npc.y = Math.min(targetGroundPixel, npc.y + NPC_FALL_SPEED * dt);
        } else if (npc.y > targetGroundPixel) {
          npc.y = targetGroundPixel;
        }
      }

      const belowTileY = Math.max(0, Math.min(CHUNK_H - 1, Math.floor((npc.y + 1) / TILE)));
      if (isSolid(this.world.actualMaterial(tileX, belowTileY))) {
        const topPixel = belowTileY * TILE;
        if (npc.y > topPixel) npc.y = topPixel;
      }

      let desiredDir: -1 | 0 | 1 = 0;
      if (target && Math.abs(dx) > TILE * 0.25) {
        desiredDir = dx > 0 ? 1 : -1;
      }

      if (desiredDir === 0) {
        if (now >= npc.wanderSwitchAt) {
          const choices: Array<-1 | 0 | 1> = [-1, 0, 1];
          npc.wanderDir = choices[Math.floor(Math.random() * choices.length)];
          npc.wanderSwitchAt = now + 1500 + Math.random() * 2500;
        }
        desiredDir = npc.wanderDir;
      }

      if (desiredDir !== 0) {
        const aheadTileX = Math.floor((npc.x + desiredDir * TILE * 0.5) / TILE);
        const groundTile = Math.max(0, Math.min(CHUNK_H - 1, targetGroundTile ?? Math.floor(npc.y / TILE)));
        const headTileY = Math.max(0, groundTile - 1);

        const headBlocked = !isPassable(this.world.actualMaterial(aheadTileX, headTileY));
        const footBlocked = !isPassable(this.world.actualMaterial(aheadTileX, groundTile));
        if (!(headBlocked || footBlocked)) {
          npc.x += desiredDir * speed * dt;
        }
      }

      if (target && dist < TILE && now - npc.lastAttack > NPC_ATTACK_COOLDOWN_MS) {
        npc.lastAttack = now;
        this.damagePlayer(target, NPC_ATTACK_DAMAGE);
      }

      if (target && dist <= NPC_SHOT_RANGE && now - npc.lastShot > NPC_SHOT_COOLDOWN_MS) {
        npc.lastShot = now;
        this.fireNpcShot(npc, target);
      }

      this.broadcastExcept(null, { type: 'npc-state', npc: this.serializeNpc(npc) });
    });
  }

  private fireNpcShot(npc: NpcEntity, target: PlayerSchema) {
    const originX = npc.x;
    const originY = npc.y - TILE * 0.5;
    const dx = target.state.x - originX;
    const dy = target.state.y - originY;
    const mag = Math.hypot(dx, dy) || 1;
    const dirX = dx / mag;
    const dirY = dy / mag;

    const trace = this.traceBullet(originX, originY, dirX, dirY, {
      excludeNpcId: npc.id,
      breaksBlocks: false,
    });
    const hit = trace.hit;

    if (hit?.kind === 'player') {
      this.damagePlayer(hit.player, NPC_SHOT_DAMAGE);
    } else if (hit?.kind === 'npc') {
      this.damageNpc(hit.npc, NPC_SHOT_DAMAGE);
    }

    this.broadcastExcept(null, {
      type: 'npc-shot',
      npcId: npc.id,
      originX,
      originY,
      dirX,
      dirY,
      hitPlayerId: hit?.kind === 'player' ? hit.player.id : null,
      distance: trace.travel,
    });
  }

  private findClosestPlayer(npc: NpcEntity): PlayerSchema | null {
    let best: PlayerSchema | null = null;
    let bestDist = Infinity;
    this.state.players.forEach((player) => {
      const dx = player.state.x - npc.x;
      const dy = player.state.y - npc.y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = player;
      }
    });
    return best;
  }

  private damageNpc(npc: NpcEntity, amount: number) {
    npc.hp = Math.max(0, npc.hp - amount);
    if (npc.hp <= 0) {
      this.npcs.delete(npc.id);
      this.broadcastExcept(null, { type: 'npc-remove', id: npc.id });
      if (this.isNight) this.ensureNpcPopulation();
    } else {
      this.broadcastExcept(null, { type: 'npc-state', npc: this.serializeNpc(npc) });
    }
  }

  private findTopSolidTile(tileX: number): number | null {
    for (let y = 0; y < CHUNK_H; y++) {
      const mat = this.world.actualMaterial(tileX, y);
      if (!isSolid(mat)) continue;
      const above = y > 0 ? this.world.actualMaterial(tileX, y - 1) : 'air';
      if (isPassable(above)) return y;
    }
    return null;
  }

  private damagePlayer(player: PlayerSchema, amount: number) {
    player.state.hp = Math.max(0, player.state.hp - amount);
    player.state.energy = Math.max(0, player.state.energy - amount * 0.1);
    if (player.state.hp <= 0 || player.state.energy <= 0) {
      this.handlePlayerDeath(player);
    } else {
      this.broadcastPlayerState(player);
    }
  }

  private handlePlayerDeath(player: PlayerSchema) {
    const currentCurrency = player.state.currency;
    const respawnState = this.randomSpawnState();
    respawnState.currency = currentCurrency;
    player.state.setFrom(respawnState);
    player.inventory.setFrom(createEmptyInventory());

    const payloadState = player.state.toJSON();
    const inventory = player.inventory.toCounts();

    this.sendToPlayer(player.id, { type: 'player-respawn', state: payloadState, inventory });
    this.sendToPlayer(player.id, { type: 'inventory-update', id: player.id, inventory });
    this.broadcastExcept(null, { type: 'player-state', id: player.id, state: payloadState });

    for (const [sessionId, schema] of this.state.players.entries()) {
      if (schema === player) {
        this.lastShotAt.set(sessionId, 0);
        break;
      }
    }
  }

  private serializeNpc(npc: NpcEntity): NPCState {
    return { id: npc.id, x: npc.x, y: npc.y, hp: npc.hp };
  }

  private randomSpawnState(): PlayerState {
    const tileX = Math.floor((Math.random() - 0.5) * 600);
    return this.createSpawnState(tileX);
  }

  private spawnState(playerIndex: number): PlayerState {
    const spawnTileX = playerIndex * 4;
    return this.createSpawnState(spawnTileX);
  }

  private createSpawnState(tileX: number): PlayerState {
    const clampedX = Math.max(-500, Math.min(500, tileX));
    let surfaceY = this.world.profileAt(clampedX).groundY;
    while (surfaceY < CHUNK_H && this.world.actualMaterial(clampedX, surfaceY) === 'air') surfaceY++;
    if (surfaceY >= CHUNK_H) surfaceY = CHUNK_H - 1;
    const spawnTileY = Math.max(0, surfaceY - 1);
    return {
      x: clampedX * TILE,
      y: spawnTileY * TILE,
      vx: 0,
      vy: 0,
      hp: 100,
      energy: 100,
      facing: 1,
      currentTool: 'shovel',
      selectedMat: null,
      currency: 0,
    };
  }

  private tickTimeOfDay() {
    const info = this.currentTimeOfDayInfo();
    const wasNight = this.isNight;
    this.isNight = info.isNight;

    if (this.isNight) {
      this.ensureNpcPopulation();
    } else if (wasNight) {
      this.clearNpcs();
    }

    this.broadcastExcept(null, { type: 'time-of-day', info });
  }

  private currentTimeOfDayInfo(): TimeOfDayInfo {
    const elapsed = (Date.now() - this.cycleStart) % DAY_NIGHT_CYCLE_MS;
    const progress = elapsed / DAY_NIGHT_CYCLE_MS;
    const isNight = progress >= 0.5;
    return { isNight, progress };
  }

  private tickDeposits() {
    if (this.deposits.size === 0) return;
    const now = Date.now();
    for (const [k, deposit] of Array.from(this.deposits.entries())) {
      if (now - deposit.placedAt < DAY_NIGHT_CYCLE_MS) continue;
      const [xStr, yStr] = k.split(',');
      const tileX = Number(xStr);
      const tileY = Number(yStr);
      const currentMat = this.world.actualMaterial(tileX, tileY);
      if (currentMat !== deposit.mat) {
        this.deposits.delete(k);
        continue;
      }

      const changes = this.world.setBlock(tileX, tileY, 'air');
      if (changes.length > 0) {
        this.applyWorldChanges(changes);
        this.updateDepositsForChanges(changes);
        this.broadcastExcept(null, { type: 'world-update', changes });
      }

      this.deposits.delete(k);
      const value = BLOCK_CURRENCY_VALUE[deposit.mat] ?? 0;
      if (value > 0) this.rewardCurrency(deposit.playerId, value);
    }
  }

  private updateDepositsForChanges(changes: BlockChange[], ownerId?: string) {
    if (changes.length === 0) return;
    const timestamp = Date.now();
    for (const change of changes) {
      const depositKey = key(change.tileX, change.tileY);
      if (change.mat === 'air') {
        this.deposits.delete(depositKey);
        continue;
      }

      if (!isSolid(change.mat)) {
        this.deposits.delete(depositKey);
        continue;
      }

      const mat = change.mat as SolidMaterial;
      const reward = BLOCK_CURRENCY_VALUE[mat] ?? 0;
      if (reward > 0 && ownerId) {
        this.deposits.set(depositKey, { playerId: ownerId, mat, placedAt: timestamp });
      } else {
        this.deposits.delete(depositKey);
      }
    }
  }

  private rewardCurrency(playerId: string, amount: number) {
    if (amount <= 0) return;
    const player = this.getPlayerById(playerId);
    if (!player) return;
    player.state.currency = (player.state.currency ?? 0) + amount;
    this.sendToPlayer(playerId, { type: 'currency-update', amount: player.state.currency });
    this.broadcastPlayerState(player);
  }

  private getPlayerById(playerId: string): PlayerSchema | null {
    for (const player of this.state.players.values()) {
      if (player.id === playerId) return player;
    }
    return null;
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
