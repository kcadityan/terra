import Phaser from 'phaser';
import type { SceneAPI } from '../shared/api';

export class PhaserSceneApi implements SceneAPI {
  private bindings = new Map<string, Phaser.GameObjects.GameObject>();

  constructor(private readonly scene: Phaser.Scene) {}

  async loadImage(key: string, url: string): Promise<void> {
    if (this.scene.textures.exists(key)) return;
    await new Promise<void>((resolve) => {
      this.scene.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
      this.scene.load.image(key, url);
      this.scene.load.start();
    });
    if (!this.scene.textures.exists(key)) {
      const g = this.scene.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 16, 16);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }
  }

  createSprite(x: number, y: number, key: string): Phaser.GameObjects.Sprite {
    const sprite = this.scene.add.sprite(x, y, key);
    sprite.setOrigin(0.5, 0.5);
    return sprite;
  }

  bindEntity(eid: string, handle: unknown): void {
    if (handle && (handle as Phaser.GameObjects.GameObject).setData) {
      this.bindings.set(eid, handle as Phaser.GameObjects.GameObject);
    }
  }

  unbindEntity(eid: string): void {
    this.bindings.delete(eid);
  }

  getBound(eid: string): Phaser.GameObjects.GameObject | undefined {
    return this.bindings.get(eid);
  }

  remove(handle: unknown): void {
    if (handle && typeof (handle as Phaser.GameObjects.GameObject).destroy === 'function') {
      (handle as Phaser.GameObjects.GameObject).destroy();
    }
  }

  setPosition(handle: unknown, x: number, y: number): void {
    if (!handle) return;
    const sprite = handle as Phaser.GameObjects.Sprite;
    if (typeof sprite.setPosition === 'function') {
      sprite.setPosition(x, y);
    }
  }

  setRotation(handle: unknown, rotation: number): void {
    if (!handle) return;
    const sprite = handle as Phaser.GameObjects.Sprite;
    if (typeof sprite.setRotation === 'function') {
      sprite.setRotation(rotation);
    }
  }

  playAnim(handle: unknown, name: string): void {
    if (handle && typeof (handle as Phaser.GameObjects.Sprite).play === 'function') {
      const sprite = handle as Phaser.GameObjects.Sprite;
      if (!sprite.anims || sprite.anims.currentAnim?.key !== name) {
        try {
          sprite.play(name, true);
        } catch {
          // ignore missing animations for placeholder sprites
        }
      }
    }
  }
}
