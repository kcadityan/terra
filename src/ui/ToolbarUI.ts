import Phaser from 'phaser';
import type { Inventory } from '../player/Inventory';
import type { SolidMaterial } from '../../engine/shared/protocol';
import type { Tool } from '../../engine/shared/game-types';

export type ToolbarItemDescriptor =
  | { kind: 'tool'; tool: Tool; label: string }
  | { kind: 'block'; mat: SolidMaterial; label: string };

interface Slot {
  item: ToolbarItemDescriptor;
  text: Phaser.GameObjects.Text;
}

const BASE_BG = 'rgba(18, 18, 24, 0.75)';
const HIGHLIGHT_BG = 'rgba(80, 120, 200, 0.85)';
const BASE_COLOR = '#cccccc';
const HIGHLIGHT_COLOR = '#ffffff';

/**
 * Simple text-based toolbar anchored to the bottom of the screen.
 */
export class ToolbarUI {
  private scene: Phaser.Scene;
  private items: ToolbarItemDescriptor[];
  private onActivate?: (index: number) => void;
  private slots: Slot[] = [];
  private selectedIndex = 0;
  private gap = 12;
  private baseY = 0;
  private cachedCounts: Inventory['counts'] | null = null;

  constructor(scene: Phaser.Scene, items: ToolbarItemDescriptor[], onActivate?: (index: number) => void) {
    this.scene = scene;
    this.items = items;
    this.onActivate = onActivate;
    this.baseY = this.scene.scale.height - 32;

    this.build();
    this.layout();

    this.scene.scale.on('resize', this.onResize, this);
  }

  destroy() {
    this.scene.scale.off('resize', this.onResize, this);
    this.slots.forEach((slot) => slot.text.destroy());
    this.slots = [];
  }

  setSelected(index: number) {
    if (index < 0 || index >= this.items.length) return;
    this.selectedIndex = index;
    this.updateStyles();
  }

  refreshCounts(counts: Inventory['counts']) {
    this.cachedCounts = counts;
    this.slots.forEach((slot, i) => {
      slot.text.setText(this.formatLabel(i, slot.item));
    });
    this.layout();
    this.updateStyles();
  }

  private onResize(gameSize: Phaser.Structs.Size) {
    this.baseY = gameSize.height - 32;
    this.layout();
  }

  private build() {
    this.items.forEach((item, index) => {
      const label = this.scene.add.text(0, 0, this.formatLabel(index, item), {
        fontSize: '14px',
        color: BASE_COLOR,
        backgroundColor: BASE_BG,
      });
      label.setPadding(8, 4, 8, 4);
      label.setScrollFactor(0);
      label.setDepth(500);
      label.setInteractive({ useHandCursor: true });
      label.on('pointerdown', () => this.handlePointerSelect(index));
      this.slots.push({ item, text: label });
    });
  }

  private layout() {
    let x = 16;
    for (const slot of this.slots) {
      slot.text.setPosition(x, this.baseY);
      x += slot.text.displayWidth + this.gap;
    }
  }

  private updateStyles() {
    this.slots.forEach((slot, idx) => {
      const highlighted = idx === this.selectedIndex;
      slot.text.setBackgroundColor(highlighted ? HIGHLIGHT_BG : BASE_BG);
      slot.text.setColor(highlighted ? HIGHLIGHT_COLOR : BASE_COLOR);
    });
  }

  private formatLabel(index: number, item: ToolbarItemDescriptor): string {
    const prefix = index === 9 ? '0' : `${index + 1}`;
    if (item.kind === 'tool') {
      return `${prefix} ${item.label}`;
    }
    const counts = this.cachedCounts;
    const count = counts ? counts[item.mat] : 0;
    return `${prefix} ${item.label} (${count})`;
  }

  private handlePointerSelect(index: number) {
    if (this.onActivate) this.onActivate(index);
  }
}
