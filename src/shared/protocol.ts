import type { Material, Tool } from './game-types';

export type SolidMaterial = Exclude<Material, 'air'>;

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  energy: number;
  facing: 1 | -1;
  currentTool: Tool;
  selectedMat: SolidMaterial | null;
  currency: number;
}

export type InventoryCounts = Record<SolidMaterial, number>;

export interface BlockChange {
  tileX: number;
  tileY: number;
  mat: Material;
}

export interface PlayerInit {
  id: string;
  state: PlayerState;
  inventory: InventoryCounts;
}

export interface TimeOfDayInfo {
  isNight: boolean;
  progress: number;
}

export interface NPCState {
  id: string;
  x: number;
  y: number;
  hp: number;
}

export type NPCInit = NPCState;

export interface WelcomeMessage {
  type: 'welcome';
  selfId: string;
  seed: number;
  players: PlayerInit[];
  world: BlockChange[];
  timeOfDay: TimeOfDayInfo;
}

export interface PlayerJoinedMessage {
  type: 'player-joined';
  player: PlayerInit;
}

export interface PlayerLeftMessage {
  type: 'player-left';
  id: string;
}

export interface PlayerStateMessage {
  type: 'player-state';
  id: string;
  state: PlayerState;
}

export interface WorldUpdateMessage {
  type: 'world-update';
  changes: BlockChange[];
}

export interface InventoryUpdateMessage {
  type: 'inventory-update';
  id: string;
  inventory: InventoryCounts;
}

export interface CurrencyUpdateMessage {
  type: 'currency-update';
  amount: number;
}

export interface PlayerShotMessage {
  type: 'player-shot';
  shooterId: string;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  hitId: string | null;
  hitNpcId?: string | null;
  distance: number;
}

export interface NPCShotMessage {
  type: 'npc-shot';
  npcId: string;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  hitPlayerId: string | null;
  distance: number;
}

export interface NPCSpawnMessage {
  type: 'npc-spawn';
  npc: NPCState;
}

export interface NPCStateMessage {
  type: 'npc-state';
  npc: NPCState;
}

export interface NPCRemoveMessage {
  type: 'npc-remove';
  id: string;
}

export interface PlayerRespawnMessage {
  type: 'player-respawn';
  state: PlayerState;
  inventory: InventoryCounts;
}

export interface TimeOfDayMessage {
  type: 'time-of-day';
  info: TimeOfDayInfo;
}

export interface ActionDeniedMessage {
  type: 'action-denied';
  reason: string;
}

export type ServerMessage =
  | WelcomeMessage
  | PlayerJoinedMessage
  | PlayerLeftMessage
  | PlayerStateMessage
  | WorldUpdateMessage
  | InventoryUpdateMessage
  | CurrencyUpdateMessage
  | PlayerShotMessage
  | NPCShotMessage
  | NPCSpawnMessage
  | NPCStateMessage
  | NPCRemoveMessage
  | PlayerRespawnMessage
  | TimeOfDayMessage
  | ActionDeniedMessage;

export interface HelloMessage {
  type: 'hello';
  name?: string;
}

export interface ClientStateMessage {
  type: 'state';
  state: PlayerState;
}

export interface MineBlockMessage {
  type: 'mine-block';
  tileX: number;
  tileY: number;
}

export interface PlaceBlockMessage {
  type: 'place-block';
  tileX: number;
  tileY: number;
  mat: SolidMaterial;
}

export interface ShootMessage {
  type: 'shoot';
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
}

export type ClientMessage =
  | HelloMessage
  | ClientStateMessage
  | MineBlockMessage
  | PlaceBlockMessage
  | ShootMessage;

export const DEFAULT_PORT = 3030;
