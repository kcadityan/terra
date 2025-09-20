export const TILE = 32;
export const CHUNK_W = 32;       // tiles per chunk (horizontally)
export const CHUNK_H = 64;       // vertical tiles we keep
export const LOAD_RADIUS = 2;    // chunks to load left/right of player

export type Tool = 'shovel' | 'pickaxe';
export type Material = 'air' | 'grass' | 'dirt' | 'rock' | 'gold';

export interface BlockData {
  mat: Material;
  strikesLeft?: number;
}

export type ChunkKey = string; // `${cx}`
