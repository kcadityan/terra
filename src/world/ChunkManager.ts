import Phaser from 'phaser';
import { CHUNK_W, CHUNK_H, TILE, type BlockData, type ChunkKey } from '../shared/game-types';
import type { Material } from '../shared/game-types';
import { Terrain } from './Terrain';
import {
  MATERIAL_COLOR,
  MATERIAL_WEIGHT,
  MATERIAL_STICKINESS,
  type SolidMaterial,
} from './Materials';
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

    for (let y = tileY - 1; y >= 0; ) {
      const cell = c.blocks[y]?.[lx];
      if (!cell || cell.mat === 'air') {
        y--;
        continue;
      }

      const mat = cell.mat as SolidMaterial;
      const clusterTop = this.findClusterTop(c, lx, y, mat);
      const clusterBottom = y;

      if (!this.clusterShouldFallClient(c, lx, clusterTop, clusterBottom, mat)) {
        y = clusterTop - 1;
        continue;
      }

      const entries: Array<{
        mat: SolidMaterial;
        sprite: Phaser.Physics.Arcade.Image | null;
        offset: number;
        startY: number;
      }> = [];

      for (let sy = clusterBottom; sy >= clusterTop; sy--) {
        const existing = c.blocks[sy][lx].mat as SolidMaterial;
        const sprite = c.sprites[sy][lx];
        entries.push({ mat: existing, sprite, offset: clusterBottom - sy, startY: sy });
        c.blocks[sy][lx] = { mat: 'air' };
        c.sprites[sy][lx] = null;
      }

      let destBottom = clusterBottom;
      while (destBottom + 1 < CHUNK_H && c.blocks[destBottom + 1][lx].mat === 'air') {
        destBottom++;
      }

      for (const entry of entries) {
        const targetY = destBottom - entry.offset;
        c.blocks[targetY][lx] = { mat: entry.mat };
        const worldX = (c.cx * CHUNK_W + lx) * TILE + TILE / 2;
        const worldY = targetY * TILE + TILE / 2;

        let sprite = entry.sprite;
        if (!sprite) {
          sprite = this.blockGroup.create(worldX, entry.startY * TILE + TILE / 2, this.rectTextureKey(entry.mat)) as Phaser.Physics.Arcade.Image;
        } else {
          sprite.setPosition(worldX, entry.startY * TILE + TILE / 2);
          sprite.setTexture(this.rectTextureKey(entry.mat));
        }
        c.sprites[targetY][lx] = sprite;
        const duration = Math.min(300, Math.abs(targetY - entry.startY) * 80 + 80);
        this.scene.tweens.add({
          targets: sprite,
          y: worldY,
          duration,
          onComplete: () => { (sprite as any).refreshBody?.(); },
        });
      }

      y = clusterTop - 1;
    }
  }

  private findClusterTop(chunk: Chunk, lx: number, startY: number, mat: SolidMaterial): number {
    let top = startY;
    while (top - 1 >= 0 && chunk.blocks[top - 1]?.[lx]?.mat === mat) top--;
    return top;
  }

  private clusterShouldFallClient(chunk: Chunk, lx: number, topY: number, bottomY: number, mat: SolidMaterial): boolean {
    const stick = MATERIAL_STICKINESS[mat] ?? 0;
    if (stick <= 0) return true;

    const clusterHeight = bottomY - topY + 1;
    const clusterWeight = clusterHeight * (MATERIAL_WEIGHT[mat] ?? 1);

    let weightAbove = 0;
    for (let y = topY - 1; y >= 0; y--) {
      const above = chunk.blocks[y]?.[lx];
      if (!above || above.mat === 'air') continue;
      weightAbove += MATERIAL_WEIGHT[above.mat as SolidMaterial] ?? 1;
    }

    return clusterWeight + weightAbove > stick;
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
