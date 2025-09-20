import Phaser from 'phaser';
import { LOAD_RADIUS, TILE } from '../types';
import { ChunkManager } from '../world/ChunkManager';
import { Player } from '../player/Player';
import { Inventory } from '../player/Inventory';
import { ToolSystem } from '../input/ToolSystem';
import { strikesFor } from '../world/Materials';
import { InventoryUI } from '../ui/InventoryUI';

export default class GameScene extends Phaser.Scene {
  private cm!: ChunkManager;
  private player!: Player;
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: {
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
    e: Phaser.Input.Keyboard.Key;
    one: Phaser.Input.Keyboard.Key;
    two: Phaser.Input.Keyboard.Key;
    three: Phaser.Input.Keyboard.Key;
    four: Phaser.Input.Keyboard.Key;
  };
  private inv = new Inventory();
  private tools = new ToolSystem();
  private hudText!: Phaser.GameObjects.Text;

  // HUD bars
  private hpBg!: Phaser.GameObjects.Graphics;
  private hpFg!: Phaser.GameObjects.Graphics;
  private enBg!: Phaser.GameObjects.Graphics;
  private enFg!: Phaser.GameObjects.Graphics;

  // Overlays
  private redOverlay!: Phaser.GameObjects.Rectangle;
  private blackOverlay!: Phaser.GameObjects.Rectangle;
  private deathInProgress = false;
  private blackoutShown = false;

  // Inventory UI / selection
  private invUI!: InventoryUI;
  private inventoryOpen = false;
  private selectedMat: 'grass' | 'dirt' | 'rock' | 'gold' | null = null;

  // Energy drain timers
  private accumMsMove = 0;
  private accumMsIdle = 0;
  private miningNow = false;

  constructor() { super('Game'); }

  preload() {}

  create() {
    // temp 'player' texture
    if (!this.textures.exists('player')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 20, 28);
      g.generateTexture('player', 20, 28);
      g.destroy();
    }

    // static group for block tiles
    this.blockGroup = this.physics.add.staticGroup();

    // world + chunks
    this.cm = new ChunkManager(this, this.blockGroup, 20250920);
    this.cm.ensureTextures();
    for (let cx = -LOAD_RADIUS; cx <= LOAD_RADIUS; cx++) this.cm.ensureChunk(cx);

    // player
    this.player = new Player(this, 0, 10 * TILE);

    // keyboard
    this.keys = {
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      q: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      e: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      one: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      two: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      three: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      four: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    };

    // mouse
    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // collisions: player vs (static) blocks
    this.physics.add.collider(this.player, this.blockGroup);

    // camera + HUD
    this.cameras.main.setBackgroundColor(0x0e0e12);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudText = this.add.text(8, 40, '', { fontSize: '14px', color: '#ffffff' }).setScrollFactor(0);

    // Bars
    this.hpBg = this.add.graphics().setScrollFactor(0);
    this.hpFg = this.add.graphics().setScrollFactor(0);
    this.enBg = this.add.graphics().setScrollFactor(0);
    this.enFg = this.add.graphics().setScrollFactor(0);
    this.drawBars();

    // Overlays (full-screen)
    const w = this.scale.width, h = this.scale.height;
    this.redOverlay = this.add.rectangle(0, 0, w, h, 0xdc3545, 0).setOrigin(0).setScrollFactor(0).setDepth(1000);
    this.blackOverlay = this.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(999);

    // Inventory UI with selection callback
    this.invUI = new InventoryUI(this, this.inv, (mat) => {
      this.selectedMat = mat;
    });
    this.invUI.setVisible(false);
  }

  private drawBars() {
    const x = 8, yHp = 8, yEn = 22;
    const w = 200, h = 10;

    this.hpBg.clear().fillStyle(0x222222, 1).fillRect(x - 1, yHp - 1, w + 2, h + 2);
    this.enBg.clear().fillStyle(0x222222, 1).fillRect(x - 1, yEn - 1, w + 2, h + 2);

    const hpFrac = this.player ? Math.max(0, Math.min(1, this.player.hp / 100)) : 1;
    const enFrac = this.player ? Math.max(0, Math.min(1, this.player.energy / 100)) : 1;

    this.hpFg.clear().fillStyle(0xdc3545, 1).fillRect(x, yHp, w * hpFrac, h);
    this.enFg.clear().fillStyle(0x1e90ff, 1).fillRect(x, yEn, w * enFrac, h);
  }

  // Mining (LEFT) with energy gate; Placing (RIGHT) of selected inventory item
  private onPointerDown(pointer: Phaser.Input.Pointer) {
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const tileX = Math.floor(worldPoint.x / TILE);
    const tileY = Math.floor(worldPoint.y / TILE);

    const reach = 1.5 * TILE;
    const dx = worldPoint.x - this.player.x;
    const dy = worldPoint.y - this.player.y;
    if (Math.hypot(dx, dy) > reach) return;

    // --- LEFT CLICK: mine (only if energy >= 10 and inventory UI closed) ---
    if (pointer.leftButtonDown() && !this.inventoryOpen) {
      if (this.player.energy < 10) {
        // energy too low to mine
        this.cameras.main.flash(120, 0, 0, 0);
        return;
      }

      const info = this.cm.getBlockDataAtTile(tileX, tileY);
      if (!info) return;
      const mat = info.data.mat;
      if (mat === 'air') return;

      if (!this.tools.targetTile || this.tools.targetTile.x !== tileX || this.tools.targetTile.y !== tileY) {
        this.tools.beginTarget(tileX, tileY, mat);
        this.tools.targetStrikesLeft = strikesFor(this.tools.current, mat);
      }

      // strike!
      this.tools.targetStrikesLeft -= 1;
      this.player.useEnergy(5);
      this.miningNow = true;

      const s = info.chunk.sprites[info.by][info.bx];
      if (s) this.tweens.add({ targets: s, alpha: 0.5, yoyo: true, duration: 60, repeat: 0 });
      this.drawBars();

      if (this.tools.targetStrikesLeft <= 0) {
        const removed = this.cm.removeBlockAt(tileX * TILE, tileY * TILE);
        if (removed) {
          this.inv.add(removed.mat as any, 1);
          this.invUI.refresh();
          this.cm.settleAfterRemoval(removed.tileX, removed.tileY);
        }
        this.tools.clearTarget();
      }
    }

    // --- RIGHT CLICK: place selected block (if any) ---
    if (pointer.rightButtonDown() && !this.inventoryOpen) {
      if (!this.selectedMat) return;
      if (this.inv.counts[this.selectedMat] <= 0) return;

      // Don't place inside the player's body
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const bodyRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      const blockRect = new Phaser.Geom.Rectangle(tileX * TILE, tileY * TILE, TILE, TILE);
      if (Phaser.Geom.Intersects.RectangleToRectangle(bodyRect, blockRect)) return;

      // Place only into air
      const existing = this.cm.getBlockDataAtTile(tileX, tileY);
      if (!existing || existing.data.mat !== 'air') return;

      if (this.cm.placeBlockAt(tileX, tileY, this.selectedMat)) {
        this.inv.remove(this.selectedMat, 1);
        this.invUI.refresh();
      }
    }
  }

  private toggleInventory() {
    this.inventoryOpen = !this.inventoryOpen;
    this.invUI.setVisible(this.inventoryOpen);
    if (this.inventoryOpen) {
      this.invUI.refresh();
    }
  }

  private respawnPlayer() {
    const tileX = Math.floor(this.player.x / TILE);
    const { groundY } = this.cm.terrain.profileAt(tileX);
    const spawnY = (groundY - 2) * TILE;

    this.player.setPosition(this.player.x, spawnY);
    this.player.setVelocity(0, 0);
    this.player.hp = 100;
    this.player.energy = 100;
    this.drawBars();

    this.tweens.add({
      targets: this.redOverlay,
      alpha: 0,
      duration: 250,
      onComplete: () => (this.deathInProgress = false),
    });
  }

  private showRedDeathFade() {
    if (this.deathInProgress) return;
    this.deathInProgress = true;
    this.redOverlay.setAlpha(0);
    this.tweens.add({
      targets: this.redOverlay,
      alpha: 0.5,
      duration: 250,
      onComplete: () => {
        this.time.delayedCall(250, () => this.respawnPlayer());
      },
    });
  }

  private updateBlackout() {
    const shouldShow = this.player.energy <= 0;
    if (shouldShow && !this.blackoutShown) {
      this.blackOverlay.setAlpha(0);
      this.tweens.add({ targets: this.blackOverlay, alpha: 0.5, duration: 200 });
      this.blackoutShown = true;
    } else if (!shouldShow && this.blackoutShown) {
      this.tweens.add({
        targets: this.blackOverlay,
        alpha: 0,
        duration: 200,
        onComplete: () => (this.blackoutShown = false),
      });
    }
  }

  update(_time: number, delta: number) {
    const dt = delta / 1000;

    // input
    const left = this.keys.a.isDown;
    const right = this.keys.d.isDown;
    const jump = this.keys.w.isDown;
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.tools.toggle();
    if (Phaser.Input.Keyboard.JustDown(this.keys.e)) this.toggleInventory();

    // quick hotkeys to select placeable item (1..4)
    if (Phaser.Input.Keyboard.JustDown(this.keys.one)) { this.selectedMat = 'grass'; this.invUI.setSelected('grass'); }
    if (Phaser.Input.Keyboard.JustDown(this.keys.two)) { this.selectedMat = 'dirt';  this.invUI.setSelected('dirt');  }
    if (Phaser.Input.Keyboard.JustDown(this.keys.three)) { this.selectedMat = 'rock';  this.invUI.setSelected('rock');  }
    if (Phaser.Input.Keyboard.JustDown(this.keys.four)) { this.selectedMat = 'gold';  this.invUI.setSelected('gold');  }

    // movement
    const moving = (left && !right) || (right && !left);
    if (left && !right) this.player.moveLeft();
    else if (right && !left) this.player.moveRight();
    else this.player.stopH();
    if (jump) this.player.tryJump();

    // inventory load effects
    const weight = this.inv.totalWeight();
    const softCap = 30;
    const speedFactor = weight <= softCap ? 1 : Math.max(0.6, 1 - (weight - softCap) / softCap);
    this.player.setLoadFactor(speedFactor);

    // Energy drain / regen
    const drainFactor = 1 + Math.max(0, (weight - softCap) / softCap);
    if (moving) {
      this.accumMsMove += delta;
      while (this.accumMsMove >= 1000) {
        this.player.useEnergy(1 * drainFactor);
        this.accumMsMove -= 1000;
      }
      this.accumMsIdle = 0;
    } else if (!this.miningNow) {
      this.accumMsIdle += delta;
      while (this.accumMsIdle >= 1000) {
        this.player.gainEnergy(2);
        this.accumMsIdle -= 1000;
      }
    }

    // stream chunks
    const cx = this.cm.worldToChunkX(this.player.x);
    for (let i = cx - LOAD_RADIUS; i <= cx + LOAD_RADIUS; i++) this.cm.ensureChunk(i);
    this.cm.unloadFar(cx, LOAD_RADIUS);

    // landing / fall damage
    const dmg = this.player.updateFallTracker();
    if (dmg > 0) {
      this.player.takeDamage(dmg);
      this.cameras.main.shake(120, 0.0025);
    }

    // Death fade & respawn; energy blackout fade
    if (this.player.hp <= 0) this.showRedDeathFade();
    this.updateBlackout();

    // HUD
    this.hudText.setText(
      `HP: ${this.player.hp}  Energy: ${this.player.energy}` +
      `  Place: ${this.selectedMat ?? '—'}\n` +
      `Weight: ${weight}  Speed: ${(speedFactor * 100) | 0}%  Inv [E]: ${this.inventoryOpen ? 'OPEN' : 'CLOSED'}`
    );
    this.drawBars();

    // reset per-frame mining flag
    this.miningNow = false;
  }
}
