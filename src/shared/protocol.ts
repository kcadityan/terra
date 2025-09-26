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

export interface WelcomeMessage {
  type: 'welcome';
  selfId: string;
  seed: number;
  players: PlayerInit[];
  world: BlockChange[];
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

export interface PlayerShotMessage {
  type: 'player-shot';
  shooterId: string;
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  hitId: string | null;
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
  | PlayerShotMessage
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
