import Phaser from 'phaser';
import { CHUNK_W, CHUNK_H, TILE, type BlockData, type ChunkKey } from '../shared/game-types';
import type { Material } from '../shared/game-types';
import { Terrain } from './Terrain';
import { MATERIAL_COLOR } from './Materials';
import type { BlockChange } from '../shared/protocol';

export interface Chunk {
  cx: number; // chunk index along X
  blocks: BlockData[][]; // [y][x]
  sprites: (Phaser.Physics.Arcade.Image | null)[][]; // [y][x]
}

export class ChunkManager {
  scene: Phaser.Scene;
  blockGroup: Phaser.Physics.Arcade.StaticGroup;
  terrain: Terrain;
  chunks = new Map<ChunkKey, Chunk>();

  constructor(scene: Phaser.Scene, blockGroup: Phaser.Physics.Arcade.StaticGroup, seed = 1337) {
    this.scene = scene;
    this.blockGroup = blockGroup;
    this.terrain = new Terrain(seed);
  }

  key(cx: number): ChunkKey { return `${cx}`; }

  worldToChunkX(worldX: number): number {
    const tileX = Math.floor(worldX / TILE);
    return Math.floor(tileX / CHUNK_W);
  }

  ensureChunk(cx: number): Chunk {
    const k = this.key(cx);
    let c = this.chunks.get(k);
    if (c) return c;

    const blocks: BlockData[][] = Array.from({ length: CHUNK_H }, () =>
      Array.from({ length: CHUNK_W }, () => ({ mat: 'air' as const }))
    );

    for (let tx = 0; tx < CHUNK_W; tx++) {
      const worldTileX = cx * CHUNK_W + tx;
      for (let ty = 0; ty < CHUNK_H; ty++) {
        const mat = this.terrain.materialAt(worldTileX, ty);
        blocks[ty][tx] = { mat };
      }
    }

    const sprites: (Phaser.Physics.Arcade.Image | null)[][] = Array.from({ length: CHUNK_H }, () =>
      Array.from({ length: CHUNK_W }, () => null)
    );

    c = { cx, blocks, sprites };
    this.chunks.set(k, c);

    this.bakeChunkSprites(c);
    return c;
  }

  unloadFar(focusCx: number, radius: number): void {
    for (const [k, chunk] of this.chunks) {
      if (Math.abs(chunk.cx - focusCx) > radius) {
        this.destroyChunkSprites(chunk);
        this.chunks.delete(k);
      }
    }
  }

  destroyChunkSprites(chunk: Chunk): void {
    for (let y = 0; y < CHUNK_H; y++) {
      for (let x = 0; x < CHUNK_W; x++) {
        const s = chunk.sprites[y][x];
        if (s) { s.destroy(); chunk.sprites[y][x] = null; }
      }
    }
  }

  bakeChunkSprites(chunk: Chunk): void {
    for (let y = 0; y < CHUNK_H; y++) {
      for (let x = 0; x < CHUNK_W; x++) {
        const b = chunk.blocks[y][x];
        if (b.mat !== 'air') {
          const worldX = (chunk.cx * CHUNK_W + x) * TILE + TILE / 2;
          const worldY = y * TILE + TILE / 2;
          const sprite = this.blockGroup.create(worldX, worldY, this.rectTextureKey(b.mat)) as Phaser.Physics.Arcade.Image;
          sprite.setOrigin(0.5, 0.5);
          (sprite as any).refreshBody?.();
          chunk.sprites[y][x] = sprite;
        }
      }
    }
  }

  rectTextureKey(mat: string): string {
    return `block_${mat}`;
  }

  removeBlockAt(worldX: number, worldY: number): { mat: string; tileX: number; tileY: number } | null {
    const tileX = Math.floor(worldX / TILE);
    const tileY = Math.floor(worldY / TILE);
    const cx = Math.floor(tileX / CHUNK_W);
    const lx = ((tileX % CHUNK_W) + CHUNK_W) % CHUNK_W;
    const ly = tileY;
    const c = this.chunks.get(this.key(cx));
    if (!c) return null;
    const b = c.blocks[ly]?.[lx];
    if (!b || b.mat === 'air') return null;

    c.blocks[ly][lx] = { mat: 'air' };
    const s = c.sprites[ly][lx];
    if (s) { s.destroy(); c.sprites[ly][lx] = null; }
    return { mat: b.mat, tileX, tileY };
  }

  getBlockDataAtTile(tileX: number, tileY: number): { chunk: Chunk; bx: number; by: number; data: BlockData } | null {
    const cx = Math.floor(tileX / CHUNK_W);
    const lx = ((tileX % CHUNK_W) + CHUNK_W) % CHUNK_W;
    const c = this.chunks.get(this.key(cx));
    if (!c) return null;
    const d = c.blocks[tileY]?.[lx];
    if (!d) return null;
    return { chunk: c, bx: lx, by: tileY, data: d };
  }

  ensureTextures(): void {
    const g = this.scene.add.graphics();
    const size = TILE;
    const mats = Object.keys(MATERIAL_COLOR) as (keyof typeof MATERIAL_COLOR)[];
    for (const m of mats) {
      const key = this.rectTextureKey(m);
      if (this.scene.textures.exists(key)) continue;
      g.clear();
      if (m !== 'air') {
        g.fillStyle(MATERIAL_COLOR[m], 1);
        g.fillRect(0, 0, size - 2, size - 2);
        g.lineStyle(2, 0x000000, 0.25);
        g.strokeRect(0, 0, size - 2, size - 2);
      }
      g.generateTexture(key, size, size);
    }
    g.destroy();
  }

  /**
   * After a block is removed at (tileX,tileY), let blocks above it fall until supported.
   * Tile-based gravity with tweened movement; then refresh static bodies.
   */
  settleAfterRemoval(tileX: number, tileY: number): void {
    const cx = Math.floor(tileX / CHUNK_W);
    const lx = ((tileX % CHUNK_W) + CHUNK_W) % CHUNK_W;
    const c = this.chunks.get(this.key(cx));
    if (!c) return;

    // scan upwards from the tile above the removed one
    for (let y = tileY - 1; y >= 0; y--) {
      const cell = c.blocks[y]?.[lx];
      if (!cell || cell.mat === 'air') continue;

      let ny = y;
      while (ny + 1 < CHUNK_H && c.blocks[ny + 1][lx].mat === 'air') ny++;
      if (ny === y) continue; // already supported

      // move block data
      const mat = cell.mat;
      c.blocks[ny][lx] = { mat };
      c.blocks[y][lx] = { mat: 'air' };

      // move/create sprite visually (and in sprite table)
      let s = c.sprites[y][lx];
      if (!s) {
        const worldX = (c.cx * CHUNK_W + lx) * TILE + TILE / 2;
        const worldY = y * TILE + TILE / 2;
        s = this.blockGroup.create(worldX, worldY, this.rectTextureKey(mat)) as Phaser.Physics.Arcade.Image;
      }
      c.sprites[ny][lx] = s;
      c.sprites[y][lx] = null;

      const targetY = ny * TILE + TILE / 2;
      this.scene.tweens.add({
        targets: s,
        y: targetY,
        duration: Math.min(300, (ny - y) * 80 + 80),
        onComplete: () => { (s as any).refreshBody?.(); }
      });
    }
  }

  /**
   * Place a solid block at the given tile if currently air.
   * Returns true if placed.
   */
  placeBlockAt(tileX: number, tileY: number, mat: Exclude<Material, 'air'>): boolean {
    if (tileY < 0 || tileY >= CHUNK_H) return false;
    const cx = Math.floor(tileX / CHUNK_W);
    const lx = ((tileX % CHUNK_W) + CHUNK_W) % CHUNK_W;
    const c = this.chunks.get(this.key(cx)) ?? this.ensureChunk(cx);

    if (c.blocks[tileY][lx].mat !== 'air') return false;

    // write data
    c.blocks[tileY][lx] = { mat };
    // create sprite
    const worldX = (c.cx * CHUNK_W + lx) * TILE + TILE / 2;
    const worldY = tileY * TILE + TILE / 2;
    const sprite = this.blockGroup.create(worldX, worldY, this.rectTextureKey(mat)) as Phaser.Physics.Arcade.Image;
    sprite.setOrigin(0.5, 0.5);
    (sprite as any).refreshBody?.();
    c.sprites[tileY][lx] = sprite;

    return true;
  }
  applyBlockChanges(changes: BlockChange[]): void {
    for (const change of changes) {
      const { tileX, tileY, mat } = change;
      if (tileY < 0 || tileY >= CHUNK_H) continue;
      const cx = Math.floor(tileX / CHUNK_W);
      const lx = ((tileX % CHUNK_W) + CHUNK_W) % CHUNK_W;
      const chunk = this.ensureChunk(cx);
      const row = chunk.blocks[tileY];
      if (!row) continue;

      if (mat === 'air') {
        row[lx] = { mat: 'air' };
        const sprite = chunk.sprites[tileY][lx];
        if (sprite) { sprite.destroy(); chunk.sprites[tileY][lx] = null; }
        continue;
      }

      row[lx] = { mat };
      let sprite = chunk.sprites[tileY][lx];
      const worldX = (chunk.cx * CHUNK_W + lx) * TILE + TILE / 2;
      const worldY = tileY * TILE + TILE / 2;
      if (!sprite) {
        sprite = this.blockGroup.create(worldX, worldY, this.rectTextureKey(mat)) as Phaser.Physics.Arcade.Image;
        chunk.sprites[tileY][lx] = sprite;
      } else {
        sprite.setTexture(this.rectTextureKey(mat));
        sprite.setPosition(worldX, worldY);
      }
      (sprite as any).refreshBody?.();
    }
  }
}
