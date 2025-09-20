import Phaser from 'phaser';
import type { Material } from '../types';
import { Inventory } from '../player/Inventory';

/**
 * Simple inventory panel with draggable item icons.
 * Drag an icon outside the panel to drop (remove) one item.
 * Click an icon to select it as the \"held\" block for placement.
 */
export class InventoryUI {
  private scene: Phaser.Scene;
  private inv: Inventory;
  private onSelect?: (mat: Exclude<Material, 'air'> | null) => void;

  private panel!: Phaser.GameObjects.Container;
  private bg!: Phaser.GameObjects.Rectangle;
  private title!: Phaser.GameObjects.Text;

  private slotSize = 28;
  private cols = 4;

  private selected: Exclude<Material, 'air'> | null = null;

  // maps material -> { icon, label, homeX, homeY }
  private slots = new Map<
    Exclude<Material, 'air'>,
    { icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Text; homeX: number; homeY: number }
  >();

  constructor(scene: Phaser.Scene, inv: Inventory, onSelect?: (mat: Exclude<Material, 'air'> | null) => void) {
    this.scene = scene;
    this.inv = inv;
    this.onSelect = onSelect;

    const w = 220;
    const h = 160;
    const x = 16;
    const y = 70;

    this.bg = scene.add
      .rectangle(0, 0, w, h, 0x111111, 0.92)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(500);

    this.bg.setStrokeStyle(2, 0xffffff, 0.2);

    this.title = scene.add
      .text(8, 6, 'Inventory', { fontSize: '14px', color: '#ffffff' })
      .setScrollFactor(0)
      .setDepth(501);

    this.panel = scene.add.container(x, y, [this.bg, this.title]).setScrollFactor(0).setDepth(500);

    // Create slots for the four materials using existing block textures
    const mats: Exclude<Material, 'air'>[] = ['grass', 'dirt', 'rock', 'gold'];
    mats.forEach((mat, i) => {
      const row = Math.floor(i / this.cols);
      const col = i % this.cols;
      const ix = 12 + col * (this.slotSize + 12);
      const iy = 28 + row * (this.slotSize + 22);

      const icon = scene.add.image(ix, iy, `block_${mat}`).setDisplaySize(this.slotSize, this.slotSize).setDepth(501);
      icon.setInteractive({ draggable: true, useHandCursor: true });

      // selection on click
      icon.on('pointerdown', () => {
        const count = this.inv.counts[mat];
        if (count <= 0) return;
        this.setSelected(this.selected === mat ? null : mat);
      });

      // drag move (local to panel)
      icon.on('drag', (_p: any, dragX: number, dragY: number) => {
        icon.x = dragX - this.panel.x;
        icon.y = dragY - this.panel.y;
      });

      // drag end: if pointer is outside panel bg bounds => remove one
      icon.on('dragend', (pointer: Phaser.Input.Pointer) => {
        const panelBounds = this.bg.getBounds(); // screen-space because scrollFactor(0)
        if (!Phaser.Geom.Rectangle.Contains(panelBounds, pointer.x, pointer.y)) {
          this.inv.remove(mat, 1);
          // if we removed the last of the selected type, clear selection
          if (this.selected === mat && this.inv.counts[mat] === 0) this.setSelected(null);
          this.refresh();
        }
        // snap back
        const slot = this.slots.get(mat)!;
        icon.x = slot.homeX;
        icon.y = slot.homeY;
      });

      const label = scene.add
        .text(ix + this.slotSize + 6, iy - 4, '0', { fontSize: '14px', color: '#ffffff' })
        .setDepth(501);

      this.panel.add([icon, label]);
      this.slots.set(mat, { icon, label, homeX: ix, homeY: iy });
    });

    this.panel.setVisible(false);
  }

  setVisible(v: boolean) {
    this.panel.setVisible(v);
  }

  setSelected(mat: Exclude<Material, 'air'> | null) {
    this.selected = mat;
    // simple highlight: scale up selected icon and tint label
    for (const [m, s] of this.slots) {
      s.icon.setScale(this.selected === m ? 1.1 : 1);
      s.label.setColor(this.selected === m ? '#ffff66' : '#ffffff');
    }
    if (this.onSelect) this.onSelect(this.selected);
  }

  getSelected(): Exclude<Material, 'air'> | null {
    return this.selected;
  }

  refresh() {
    const mats: Exclude<Material, 'air'>[] = ['grass', 'dirt', 'rock', 'gold'];
    for (const mat of mats) {
      const slot = this.slots.get(mat)!;
      const count = this.inv.counts[mat];
      slot.label.setText(String(count));
      slot.icon.setAlpha(count > 0 ? 1 : 0.25);
      // if selected but now zero, clear selection
      if (this.selected === mat && count === 0) this.setSelected(null);
    }
  }
}
