export const TILE = 32;
export const CHUNK_W = 32;       // tiles per chunk (horizontally)
export const CHUNK_H = 64;       // vertical tiles we keep
export const LOAD_RADIUS = 2;    // chunks to load left/right of player
export const DEFAULT_SEED = 20250920;
export const RIFLE_RANGE_BLOCKS = 100;
export const RIFLE_COOLDOWN_MS = 1000;
export const RIFLE_BULLET_SPEED = 1600; // pixels per second
export const WORLD_GRAVITY = 900;
export const RIFLE_BULLET_GRAVITY = WORLD_GRAVITY * 0.2;

export type Tool = 'shovel' | 'pickaxe' | 'rifle';
export type Material =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'rock'
  | 'coal'
  | 'copper'
  | 'silver'
  | 'gold'
  | 'diamond';

export interface BlockData {
  mat: Material;
  strikesLeft?: number;
}

export type ChunkKey = string; // `${cx}`
