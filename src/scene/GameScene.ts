import Phaser from 'phaser';
import {
  DEFAULT_SEED,
  LOAD_RADIUS,
  TILE,
  type Tool,
  RIFLE_RANGE_BLOCKS,
  RIFLE_COOLDOWN_MS,
  RIFLE_BULLET_SPEED,
  RIFLE_BULLET_GRAVITY,
} from '../shared/game-types';
import { ChunkManager } from '../world/ChunkManager';
import { Player } from '../player/Player';
import { Inventory } from '../player/Inventory';
import { ToolSystem } from '../input/ToolSystem';
import { strikesFor, SOLID_MATERIALS } from '../world/Materials';
import { ToolbarUI, type ToolbarItemDescriptor } from '../ui/ToolbarUI';
import { NetworkClient } from '../network/NetworkClient';
import type {
  BlockChange,
  PlayerInit,
  PlayerState,
  PlayerShotMessage,
  InventoryCounts,
  SolidMaterial,
  NPCState,
  NPCShotMessage,
  TimeOfDayInfo,
  PlayerRespawnMessage,
} from '../shared/protocol';

export default class GameScene extends Phaser.Scene {
  private cm!: ChunkManager;
  private player!: Player;
  private blockGroup!: Phaser.Physics.Arcade.StaticGroup;
  private keys!: {
    a: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    w: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
  };
  private numberKeys: Phaser.Input.Keyboard.Key[] = [];
  private inv = new Inventory();
  private tools = new ToolSystem();
  private toolbar!: ToolbarUI;
  private toolbarItems: ToolbarItemDescriptor[] = [
    { kind: 'tool', tool: 'shovel', label: 'Shovel' },
    { kind: 'tool', tool: 'pickaxe', label: 'Pickaxe' },
    { kind: 'tool', tool: 'rifle', label: 'Rifle' },
    { kind: 'block', mat: 'dirt', label: 'Dirt' },
    { kind: 'block', mat: 'rock', label: 'Stone' },
    { kind: 'block', mat: 'wood', label: 'Wood' },
    { kind: 'block', mat: 'coal', label: 'Coal' },
    { kind: 'block', mat: 'copper', label: 'Copper' },
    { kind: 'block', mat: 'silver', label: 'Silver' },
    { kind: 'block', mat: 'gold', label: 'Gold' },
    { kind: 'block', mat: 'diamond', label: 'Diamond' },
  ];
  private selectedSlot = 0;
  private activeItem: ToolbarItemDescriptor | null = null;
  private selectedMat: SolidMaterial | null = null;
  private lastMiningTool: Exclude<Tool, 'rifle'> = 'shovel';
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
  private resizeListenerAttached = false;

  // Projectiles
  private bullets!: Phaser.Physics.Arcade.Group;
  private bulletSpeed = RIFLE_BULLET_SPEED;
  private rifleMaxDistance = TILE * RIFLE_RANGE_BLOCKS;
  private lastShotTime = -Infinity;
  private dayOverlay!: Phaser.GameObjects.Rectangle;
  private isNight = false;
  private timeOfDayProgress = 0.25;
  private currency = 0;

  // Energy drain timers
  private accumMsMove = 0;
  private accumMsIdle = 0;
  private miningNow = false;

  // Networking
  private net = new NetworkClient();
  private selfId: string | null = null;
  private remotePlayers = new Map<string, Player>();
  private npcSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private stateSendAccum = 0;
  private pendingRespawn: PlayerRespawnMessage | null = null;

  constructor() { super('Game'); }

  preload() {}

  create() {
    if (!this.textures.exists('player')) {
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 20, 28);
      g.generateTexture('player', 20, 28);
      g.destroy();
    }

    this.blockGroup = this.physics.add.staticGroup();

    this.cm = new ChunkManager(this, this.blockGroup, DEFAULT_SEED);
    this.cm.ensureTextures();
    for (let cx = -LOAD_RADIUS; cx <= LOAD_RADIUS; cx++) this.cm.ensureChunk(cx);

    this.player = new Player(this, 0, 10 * TILE);

    this.keys = {
      a: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      d: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      w: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      q: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };
    const digitKeyCodes = [
      Phaser.Input.Keyboard.KeyCodes.ONE,
      Phaser.Input.Keyboard.KeyCodes.TWO,
      Phaser.Input.Keyboard.KeyCodes.THREE,
      Phaser.Input.Keyboard.KeyCodes.FOUR,
      Phaser.Input.Keyboard.KeyCodes.FIVE,
      Phaser.Input.Keyboard.KeyCodes.SIX,
      Phaser.Input.Keyboard.KeyCodes.SEVEN,
      Phaser.Input.Keyboard.KeyCodes.EIGHT,
      Phaser.Input.Keyboard.KeyCodes.NINE,
      Phaser.Input.Keyboard.KeyCodes.ZERO,
    ];
    this.numberKeys = digitKeyCodes.map((code) => this.input.keyboard!.addKey(code));

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    this.physics.add.collider(this.player, this.blockGroup);

    if (!this.textures.exists('bullet')) {
      const g = this.add.graphics();
      g.fillStyle(0xfff2a8, 1);
      g.fillRect(0, 0, 12, 4);
      g.generateTexture('bullet', 12, 4);
      g.destroy();
    }

    if (!this.textures.exists('npc')) {
      const g = this.add.graphics();
      g.fillStyle(0xc62828, 1);
      g.fillRect(0, 0, TILE * 0.7, TILE);
      g.generateTexture('npc', TILE, TILE);
      g.destroy();
    }

    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, allowGravity: false });

    this.cameras.main.setBackgroundColor(0xcfe8ff);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudText = this.add.text(8, 40, '', { fontSize: '14px', color: '#ffffff' }).setScrollFactor(0).setDepth(100);

    this.hpBg = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.hpFg = this.add.graphics().setScrollFactor(0).setDepth(91);
    this.enBg = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.enFg = this.add.graphics().setScrollFactor(0).setDepth(91);
    this.drawBars();

    const w = this.scale.width;
    const h = this.scale.height;
    this.redOverlay = this.add.rectangle(0, 0, w, h, 0xdc3545, 0).setOrigin(0).setScrollFactor(0).setDepth(1000);
    this.blackOverlay = this.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(999);
    this.dayOverlay = this.add.rectangle(0, 0, w, h, 0x000020, 0).setOrigin(0).setScrollFactor(0).setDepth(20);
    this.updateLighting();

    this.toolbar = new ToolbarUI(this, this.toolbarItems, (index) => this.applySlotSelection(index));
    this.toolbar.refreshCounts(this.inv.counts);
    this.applySlotSelection(this.selectedSlot);

    if (!this.resizeListenerAttached) {
      this.scale.on('resize', this.handleResize, this);
      this.events.once(Phaser.Scenes.Events.DESTROY, () => {
        this.scale.off('resize', this.handleResize, this);
      });
      this.resizeListenerAttached = true;
    }

    this.initNetwork();
  }

  private initNetwork() {
    this.net.on('welcome', (msg) => {
      this.selfId = msg.selfId;
      if (msg.seed !== DEFAULT_SEED) {
        console.warn('[game] server seed mismatch; using local seed');
      }

      this.applyWorldChanges(msg.world);

      msg.players.forEach((info) => {
        if (info.id === this.selfId) {
          this.hydrateSelf(info);
        } else {
          this.spawnRemote(info);
        }
      });

      if (msg.timeOfDay) this.applyTimeOfDay(msg.timeOfDay);
    });

    this.net.on('playerJoined', (info) => {
      if (info.id === this.selfId) return;
      this.spawnRemote(info);
    });

    this.net.on('playerLeft', (id) => {
      this.removeRemote(id);
    });

    this.net.on('playerState', ({ id, state }) => {
      if (id === this.selfId) return;
      this.updateRemoteState(id, state);
    });

    this.net.on('worldUpdate', (changes) => {
      this.applyWorldChanges(changes);
    });

    this.net.on('inventoryUpdate', (msg) => {
      if (msg.id !== this.selfId) return;
      this.inv.setAll(msg.inventory);
      this.toolbar.refreshCounts(this.inv.counts);
      this.ensureValidSelection();
    });

    this.net.on('currencyUpdate', (amount) => {
      this.currency = amount;
    });

    this.net.on('actionDenied', (reason) => {
      console.warn('[game] action denied', reason);
      this.tools.clearTarget();
    });

    this.net.on('playerShot', (msg) => {
      this.onPlayerShot(msg);
    });

    this.net.on('npcSpawn', (npc) => this.spawnNpc(npc));
    this.net.on('npcState', (npc) => this.updateNpc(npc));
    this.net.on('npcRemove', (id) => this.removeNpc(id));
    this.net.on('npcShot', (msg) => this.onNpcShot(msg));
    this.net.on('playerRespawn', (msg) => this.onPlayerRespawn(msg));
    this.net.on('timeOfDay', (info) => this.applyTimeOfDay(info));

    this.net.connect();
  }

  private hydrateSelf(info: PlayerInit) {
    this.player.setPosition(info.state.x, info.state.y);
    this.player.setVelocity(info.state.vx, info.state.vy);
    this.player.hp = info.state.hp;
    this.player.energy = info.state.energy;
    this.player.facing = info.state.facing;
    this.player.setFlipX(this.player.facing < 0);
    this.currency = info.state.currency ?? 0;
    this.tools.current = info.state.currentTool;
    if (info.state.currentTool === 'shovel' || info.state.currentTool === 'pickaxe') {
      this.lastMiningTool = info.state.currentTool;
    }
    this.selectedMat = info.state.selectedMat;
    this.inv.setAll(info.inventory);
    this.toolbar.refreshCounts(this.inv.counts);
    const slot = this.resolveSlotForState(info.state);
    this.applySlotSelection(slot);
    this.drawBars();
  }

  private resolveSlotForState(state: PlayerState): number {
    if (state.selectedMat) {
      const idx = this.toolbarItems.findIndex((item) => item.kind === 'block' && item.mat === state.selectedMat);
      if (idx >= 0) return idx;
    }
    const toolIdx = this.toolbarItems.findIndex((item) => item.kind === 'tool' && item.tool === state.currentTool);
    return toolIdx >= 0 ? toolIdx : 0;
  }

  private applySlotSelection(index: number) {
    if (index < 0 || index >= this.toolbarItems.length) return;
    this.selectedSlot = index;
    const item = this.toolbarItems[index];
    this.activeItem = item;
    this.toolbar.setSelected(index);

    if (item.kind === 'tool') {
      if (item.tool === 'shovel' || item.tool === 'pickaxe') {
        this.lastMiningTool = item.tool;
      }
      this.tools.set(item.tool);
      this.selectedMat = null;
    } else {
      this.selectedMat = item.mat;
      this.tools.set(this.lastMiningTool);
    }
  }

  private ensureValidSelection() {
    if (!this.activeItem) {
      this.applySlotSelection(this.selectedSlot);
      return;
    }
    if (this.activeItem.kind === 'block' && this.inv.counts[this.activeItem.mat] <= 0) {
      const availableBlock = this.toolbarItems.findIndex(
        (item) => item.kind === 'block' && this.inv.counts[item.mat] > 0,
      );
      if (availableBlock >= 0) {
        this.applySlotSelection(availableBlock);
      } else {
        const fallback = this.toolbarItems.findIndex((item) => item.kind === 'tool' && item.tool === this.lastMiningTool);
        this.applySlotSelection(fallback >= 0 ? fallback : 0);
      }
    } else {
      this.toolbar.setSelected(this.selectedSlot);
    }
  }

  private spawnRemote(info: PlayerInit) {
    if (this.remotePlayers.has(info.id)) {
      this.updateRemoteState(info.id, info.state);
      return;
    }
    const remote = new Player(this, info.state.x, info.state.y);
    const body = remote.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.moves = false;
    body.enable = false;
    remote.setTint(0x88ccff);
    remote.setAlpha(0.9);
    this.remotePlayers.set(info.id, remote);
  }

  private removeRemote(id: string) {
    const p = this.remotePlayers.get(id);
    if (!p) return;
    p.destroy();
    this.remotePlayers.delete(id);
  }

  private updateRemoteState(id: string, state: PlayerState) {
    const remote = this.remotePlayers.get(id);
    if (!remote) {
      const inventory = Object.fromEntries(SOLID_MATERIALS.map((mat) => [mat, 0])) as InventoryCounts;
      this.spawnRemote({ id, state, inventory });
      return;
    }
    remote.setPosition(state.x, state.y);
    remote.setFlipX(state.facing < 0);
  }

  private applyWorldChanges(changes: BlockChange[]) {
    if (changes.length === 0) return;
    this.cm.applyBlockChanges(changes);
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

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const tileX = Math.floor(worldPoint.x / TILE);
    const tileY = Math.floor(worldPoint.y / TILE);

    const reach = 1.5 * TILE;
    const dx = worldPoint.x - this.player.x;
    const dy = worldPoint.y - this.player.y;
    const distance = Math.hypot(dx, dy);

    if (pointer.leftButtonDown()) {
      if (this.activeItem?.kind === 'tool' && this.activeItem.tool === 'rifle') {
        this.fireRifle(dx, dy);
        return;
      }

      if (distance > reach) return;
      if (this.player.energy < 0.5) {
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

      if (this.tools.current === 'rifle') return;

      this.tools.targetStrikesLeft -= 1;
      this.player.useEnergy(0.5);
      this.miningNow = true;

      const s = info.chunk.sprites[info.by][info.bx];
      if (s) this.tweens.add({ targets: s, alpha: 0.5, yoyo: true, duration: 60, repeat: 0 });
      this.drawBars();

      if (this.tools.targetStrikesLeft <= 0) {
        this.net.requestMine(tileX, tileY);
        this.tools.clearTarget();
      }
    }

    if (pointer.rightButtonDown()) {
      if (distance > reach) return;
      if (!this.selectedMat) return;
      if (this.inv.counts[this.selectedMat] <= 0) return;

      const body = this.player.body as Phaser.Physics.Arcade.Body;
      const bodyRect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height);
      const blockRect = new Phaser.Geom.Rectangle(tileX * TILE, tileY * TILE, TILE, TILE);
      if (Phaser.Geom.Intersects.RectangleToRectangle(bodyRect, blockRect)) return;

      const existing = this.cm.getBlockDataAtTile(tileX, tileY);
      if (!existing || existing.data.mat !== 'air') return;

      this.net.requestPlace(tileX, tileY, this.selectedMat);
    }
  }

  private fireRifle(dx: number, dy: number) {
    const magnitude = Math.hypot(dx, dy);
    if (magnitude <= 0.0001) return;

    const now = this.time.now;
    if (now - this.lastShotTime < RIFLE_COOLDOWN_MS) return;
    this.lastShotTime = now;

    const dirX = dx / magnitude;
    const dirY = dy / magnitude;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const originX = this.player.x + dirX * 16;
    const originY = body.center.y - body.height * 0.35 + dirY * 8;

    this.player.facing = dirX < 0 ? -1 : 1;
    this.player.setFlipX(this.player.facing < 0);

    this.spawnBullet(this.selfId, originX, originY, dirX, dirY, this.rifleMaxDistance);
    this.net.sendShoot(originX, originY, dirX, dirY);

    this.drawBars();
    this.tools.clearTarget();
  }

  private spawnBullet(ownerId: string | null, originX: number, originY: number, dirX: number, dirY: number, distance?: number) {
    const bullet = this.physics.add.image(originX, originY, 'bullet');
    bullet.setDepth(450);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setCollideWorldBounds(false);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    const vx = dirX * this.bulletSpeed;
    const vy = dirY * this.bulletSpeed;
    body.setVelocity(vx, vy);
    body.setSize(12, 4);
    body.setOffset(0, 0);
    const maxDistance = distance ?? this.rifleMaxDistance;
    bullet.setData('maxDistance', maxDistance);
    bullet.setData('startX', originX);
    bullet.setData('startY', originY);
    bullet.setData('ownerId', ownerId ?? '');
    bullet.setData('velX', vx);
    bullet.setData('velY', vy);
    if (ownerId && ownerId.startsWith('npc:')) {
      bullet.setTint(0xff6666);
    } else if (ownerId && ownerId !== this.selfId) {
      bullet.setTint(0x66b3ff);
    } else {
      bullet.clearTint();
    }
    this.bullets.add(bullet);
  }

  private updateBullets(deltaMs: number) {
    const dt = deltaMs / 1000;
    const bullets = this.bullets.getChildren() as Phaser.Physics.Arcade.Image[];
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      let vx = bullet.getData('velX') as number;
      let vy = bullet.getData('velY') as number;
      vy += RIFLE_BULLET_GRAVITY * dt;
      bullet.setData('velY', vy);
      body.setVelocity(vx, vy);
      bullet.rotation = Math.atan2(vy, vx);

      const startX = bullet.getData('startX') as number;
      const startY = bullet.getData('startY') as number;
      const maxDistance = bullet.getData('maxDistance') as number;
      const travelled = Phaser.Math.Distance.Between(startX, startY, bullet.x, bullet.y);
      if (travelled >= maxDistance) {
        this.destroyBullet(bullet);
        continue;
      }

      const tileX = Math.floor(bullet.x / TILE);
      const tileY = Math.floor(bullet.y / TILE);
      const info = this.cm.getBlockDataAtTile(tileX, tileY);
      if (info && info.data.mat !== 'air') {
        this.destroyBullet(bullet);
      }
    }
  }

  private destroyBullet(bullet: Phaser.Physics.Arcade.Image) {
    this.bullets.remove(bullet, true, true);
  }

  private onPlayerShot(msg: PlayerShotMessage) {
    if (!Number.isFinite(msg.dirX) || !Number.isFinite(msg.dirY)) return;

    const ownerIsSelf = msg.shooterId === this.selfId;
    if (!ownerIsSelf) {
      const distance = msg.distance ?? this.estimateHitDistance(msg) ?? this.rifleMaxDistance;
      this.spawnBullet(msg.shooterId, msg.originX, msg.originY, msg.dirX, msg.dirY, distance);
    } else if (msg.hitId || msg.hitNpcId || msg.distance < this.rifleMaxDistance - 1) {
      this.trimOwnBullet(msg);
    }

    if (msg.hitId === this.selfId) {
      this.player.hp = 0;
      this.drawBars();
      this.showRedDeathFade();
    }

    if (msg.hitNpcId) {
      const npc = this.npcSprites.get(msg.hitNpcId);
      if (npc) this.flashNpc(npc);
    }
  }

  private estimateHitDistance(msg: PlayerShotMessage): number | null {
    if (typeof msg.distance === 'number') return msg.distance;
    if (msg.hitId) {
      if (msg.hitId === this.selfId) {
        return Phaser.Math.Distance.Between(msg.originX, msg.originY, this.player.x, this.player.y);
      }
      const remote = this.remotePlayers.get(msg.hitId);
      if (remote) {
        return Phaser.Math.Distance.Between(msg.originX, msg.originY, remote.x, remote.y);
      }
    }
    if (msg.hitNpcId) {
      const npc = this.npcSprites.get(msg.hitNpcId);
      if (npc) {
        return Phaser.Math.Distance.Between(msg.originX, msg.originY, npc.x, npc.y);
      }
    }
    return null;
  }

  private trimOwnBullet(msg: PlayerShotMessage) {
    const bullets = this.bullets.getChildren() as Phaser.Physics.Arcade.Image[];
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      if ((bullet.getData('ownerId') as string) !== (this.selfId ?? '')) continue;
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      const vx = body.velocity.x;
      const vy = body.velocity.y;
      const speed = Math.hypot(vx, vy);
      if (speed <= 0.0001) continue;
      const dirX = vx / speed;
      const dirY = vy / speed;
      const dot = dirX * msg.dirX + dirY * msg.dirY;
      if (dot < 0.995) continue;
      this.destroyBullet(bullet);
      break;
    }
  }

  private handleResize(size: Phaser.Structs.Size) {
    const { width, height } = size;
    if (this.redOverlay) this.redOverlay.setDisplaySize(width, height);
    if (this.blackOverlay) this.blackOverlay.setDisplaySize(width, height);
    if (this.dayOverlay) this.dayOverlay.setDisplaySize(width, height);
    this.updateLighting();
  }

  private respawnPlayer() {
    this.executeRespawn();

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

    if (!this.deathInProgress && this.pendingRespawn) {
      this.executeRespawn();
    }

    const left = this.keys.a.isDown;
    const right = this.keys.d.isDown;
    const jump = this.keys.w.isDown;

    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) {
      const nextTool = this.lastMiningTool === 'shovel' ? 'pickaxe' : 'shovel';
      const idx = this.toolbarItems.findIndex((item) => item.kind === 'tool' && item.tool === nextTool);
      if (idx >= 0) this.applySlotSelection(idx);
    }

    this.numberKeys.forEach((key, idx) => {
      if (idx >= this.toolbarItems.length) return;
      if (Phaser.Input.Keyboard.JustDown(key)) this.applySlotSelection(idx);
    });

    const moving = (left && !right) || (right && !left);
    if (left && !right) this.player.moveLeft();
    else if (right && !left) this.player.moveRight();
    else this.player.stopH();
    if (jump) {
      const jumped = this.player.tryJump();
      if (jumped) this.player.useEnergy(0.3);
    }

    const weight = this.inv.totalWeight();
    const softCap = 30;
    const speedFactor = weight <= softCap ? 1 : Math.max(0.6, 1 - (weight - softCap) / softCap);
    this.player.setLoadFactor(speedFactor);

    const drainFactor = 1 + Math.max(0, (weight - softCap) / softCap);
    if (moving) {
      this.accumMsMove += delta;
      while (this.accumMsMove >= 1000) {
        this.player.useEnergy(0.2 * drainFactor);
        this.accumMsMove -= 1000;
      }
      this.accumMsIdle = 0;
    } else if (!this.miningNow) {
      this.accumMsIdle += delta;
      while (this.accumMsIdle >= 1000) {
        this.player.gainEnergy(10);
        this.accumMsIdle -= 1000;
      }
    }

    if (this.player.energy <= 0) {
      this.player.takeDamage(5 * dt);
    }

    const cx = this.cm.worldToChunkX(this.player.x);
    for (let i = cx - LOAD_RADIUS; i <= cx + LOAD_RADIUS; i++) this.cm.ensureChunk(i);
    this.cm.unloadFar(cx, LOAD_RADIUS);

    const dmg = this.player.updateFallTracker();
    if (dmg > 0) {
      this.player.takeDamage(dmg);
      this.cameras.main.shake(120, 0.0025);
    }

    if (this.activeItem?.kind === 'tool' && this.activeItem.tool === 'rifle') {
      const pointer = this.input.activePointer;
      if (pointer) {
        const worldPoint = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
        if (worldPoint) {
          this.player.facing = worldPoint.x < this.player.x ? -1 : 1;
        }
      }
    }
    this.player.setFlipX(this.player.facing < 0);

    this.updateBullets(delta);
    this.updateNpcSprites(delta);

    if (this.player.hp <= 0) this.showRedDeathFade();
    this.updateBlackout();

    const activeLabel = this.activeItem ? this.activeItem.label : '—';
    this.hudText.setText(
      `HP: ${this.player.hp}  Energy: ${this.player.energy}  Currency: ${this.currency}  Active: ${activeLabel}` +
      `  Block: ${this.selectedMat ?? '—'}\n` +
      `Weight: ${weight}  Speed: ${(speedFactor * 100) | 0}%`
    );
    this.drawBars();

    this.miningNow = false;

    this.stateSendAccum += delta;
    if (this.stateSendAccum >= 120) {
      this.stateSendAccum = 0;
      this.pushStateToServer();
    }
  }

  private pushStateToServer() {
    if (!this.selfId || !this.net.connected) return;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const payload: PlayerState = {
      x: this.player.x,
      y: this.player.y,
      vx: body.velocity.x,
      vy: body.velocity.y,
      hp: this.player.hp,
      energy: this.player.energy,
      facing: this.player.facing,
      currentTool: this.tools.current,
      selectedMat: this.selectedMat,
      currency: this.currency,
    };
    this.net.sendState(payload);
  }

  private spawnNpc(state: NPCState) {
    let sprite = this.npcSprites.get(state.id);
    if (!sprite) {
      sprite = this.add.sprite(state.x, state.y, 'npc');
      sprite.setOrigin(0.5, 1);
      sprite.setDepth(50);
      this.npcSprites.set(state.id, sprite);
    }
    sprite.setPosition(state.x, state.y);
    sprite.setScale(1);
    sprite.setData('hp', state.hp);
  }

  private updateNpc(state: NPCState) {
    const sprite = this.npcSprites.get(state.id);
    if (!sprite) {
      this.spawnNpc(state);
      return;
    }
    const prevHP = sprite.getData('hp') as number | undefined;
    sprite.setData('hp', state.hp);
    sprite.setPosition(state.x, state.y);
    if (prevHP !== undefined && state.hp < prevHP) {
      this.flashNpc(sprite);
    }
  }

  private removeNpc(id: string) {
    const sprite = this.npcSprites.get(id);
    if (!sprite) return;
    this.npcSprites.delete(id);
    sprite.destroy();
  }

  private onNpcShot(msg: NPCShotMessage) {
    const distance = msg.distance ?? this.estimateNpcShotDistance(msg) ?? this.rifleMaxDistance;
    this.spawnBullet(`npc:${msg.npcId}`, msg.originX, msg.originY, msg.dirX, msg.dirY, distance);
    if (msg.hitPlayerId === this.selfId) {
      this.player.hp = 0;
      this.drawBars();
      this.showRedDeathFade();
    }
  }

  private onPlayerRespawn(msg: PlayerRespawnMessage) {
    if (!this.deathInProgress) {
      this.player.hp = 0;
      this.drawBars();
      this.showRedDeathFade();
    }
    this.pendingRespawn = msg;
    if (!this.deathInProgress) {
      this.executeRespawn();
    }
  }

  private applyTimeOfDay(info: TimeOfDayInfo) {
    this.isNight = info.isNight;
    this.timeOfDayProgress = info.progress;
    this.updateLighting();
  }

  private updateNpcSprites(_delta: number) {
    // reserve for future animation, currently positions handled on updates
  }

  private flashNpc(sprite: Phaser.GameObjects.Sprite) {
    sprite.setTintFill(0xffffff);
    this.tweens.add({
      targets: sprite,
      alpha: { from: 1, to: 0.2 },
      yoyo: true,
      duration: 80,
      repeat: 0,
      onComplete: () => sprite.clearTint(),
    });
  }

  private updateLighting() {
    const overlay = this.dayOverlay;
    if (!overlay) return;
    const progress = Phaser.Math.Wrap(this.timeOfDayProgress, 0, 1);
    const dayPhase = progress < 0.5 ? progress / 0.5 : 0;
    const nightPhase = progress >= 0.5 ? (progress - 0.5) / 0.5 : 0;

    const dayBrightness = dayPhase > 0 ? Math.sin(dayPhase * Math.PI) : 0;
    const nightIntensity = nightPhase > 0 ? Math.sin(nightPhase * Math.PI) : 0;

    const dayColor = Phaser.Display.Color.ValueToColor(0xcfe8ff);
    const nightColor = Phaser.Display.Color.ValueToColor(0x050810);
    const blend = Phaser.Display.Color.Interpolate.ColorWithColor(
      nightColor,
      dayColor,
      100,
      Math.round(Math.min(1, dayBrightness) * 100)
    );
    const skyColor = Phaser.Display.Color.GetColor(Math.round(blend.r), Math.round(blend.g), Math.round(blend.b));
    this.cameras.main.setBackgroundColor(skyColor);

    const overlayAlpha = 0.55 * Math.min(1, nightIntensity);
    overlay.setFillStyle(0x000015, overlayAlpha);
  }

  private executeRespawn() {
    const data = this.pendingRespawn;
    if (!data) {
      return;
    }
    this.pendingRespawn = null;

    const state = data.state;
    this.player.setPosition(state.x, state.y);
    this.player.setVelocity(0, 0);
    this.player.hp = state.hp;
    this.player.energy = state.energy;
    this.player.facing = state.facing;
    this.player.setFlipX(this.player.facing < 0);
    this.currency = state.currency ?? this.currency;

    this.tools.current = state.currentTool;
    if (this.tools.current === 'shovel' || this.tools.current === 'pickaxe') this.lastMiningTool = this.tools.current;
    this.inv.setAll(data.inventory);
    this.toolbar.refreshCounts(this.inv.counts);

    this.selectedMat = state.selectedMat;

    const targetSlot = state.selectedMat
      ? this.toolbarItems.findIndex((item) => item.kind === 'block' && item.mat === state.selectedMat)
      : this.toolbarItems.findIndex((item) => item.kind === 'tool' && item.tool === state.currentTool);
    this.applySlotSelection(targetSlot >= 0 ? targetSlot : 0);
    this.ensureValidSelection();

    this.drawBars();

    const cx = this.cm.worldToChunkX(this.player.x);
    for (let i = cx - LOAD_RADIUS; i <= cx + LOAD_RADIUS; i++) this.cm.ensureChunk(i);
  }

  private estimateNpcShotDistance(msg: NPCShotMessage): number | null {
    if (typeof msg.distance === 'number') return msg.distance;
    if (msg.hitPlayerId) {
      if (msg.hitPlayerId === this.selfId) {
        return Phaser.Math.Distance.Between(msg.originX, msg.originY, this.player.x, this.player.y);
      }
      const remote = this.remotePlayers.get(msg.hitPlayerId);
      if (remote) {
        return Phaser.Math.Distance.Between(msg.originX, msg.originY, remote.x, remote.y);
      }
    }
    return null;
  }

}
