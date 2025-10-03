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
} from '../../engine/shared/game-types';
import { ChunkManager } from '../world/ChunkManager';
import { Player } from '../player/Player';
import { Inventory } from '../player/Inventory';
import { ToolSystem } from '../input/ToolSystem';
import { ToolbarUI, type ToolbarItemDescriptor } from '../ui/ToolbarUI';
import { NetworkClient } from '../network/NetworkClient';
import type {
  BlockChange,
  PlayerInit,
  PlayerState,
  PlayerShotMessage,
  SolidMaterial,
  InventoryCounts,
} from '../../engine/shared/protocol';
import { applyMineAction, evaluatePlacementAction, type MineState } from './state/actions';
import { advanceEnergy } from './state/playerEnergy';
import { deriveHudState } from './state/hud';
import { initialClientWorldState, reduceClientEvent } from './state/clientWorld';
import { createClientRuntime, PhaserSceneApi, type ClientRuntime } from '../../engine/client';
import { coreClientModule } from '../../mods/core/client';

const PLAYER_KIND = 'core.terra.player';

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
  private clientWorld = initialClientWorldState();

  // Energy drain timers
  private accumMsMove = 0;
  private accumMsIdle = 0;
  private miningNow = false;

  // Networking
  private net = new NetworkClient();
  private selfId: string | null = null;
  private runtime!: ClientRuntime;
  private runtimeReady!: Promise<void>;
  private remotePlayers = new Map<string, PlayerState>();
  private stateSendAccum = 0;

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

    this.runtimeReady = this.setupRuntime().catch((err) => {
      console.error('[client] runtime init failed', err);
    });

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

    this.bullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, allowGravity: true });
    this.physics.add.collider(
      this.bullets,
      this.blockGroup,
      (_bullet, _block) => {
        const bulletImg = _bullet as Phaser.Physics.Arcade.Image;
        this.destroyBullet(bulletImg);
      },
      undefined,
      this,
    );

    const onWorldBounds = (body: Phaser.Physics.Arcade.Body) => {
      const gameObject = body.gameObject;
      if (!gameObject) return;
      if (!this.bullets.contains(gameObject)) return;
      this.destroyBullet(gameObject as Phaser.Physics.Arcade.Image);
    };
    this.physics.world.on('worldbounds', onWorldBounds);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.physics.world.off('worldbounds', onWorldBounds);
    });
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.alignBulletRotation, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.POST_UPDATE, this.alignBulletRotation, this);
    });

    this.cameras.main.setBackgroundColor(0x0e0e12);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.hudText = this.add.text(8, 40, '', { fontSize: '14px', color: '#ffffff' }).setScrollFactor(0);

    this.hpBg = this.add.graphics().setScrollFactor(0);
    this.hpFg = this.add.graphics().setScrollFactor(0);
    this.enBg = this.add.graphics().setScrollFactor(0);
    this.enFg = this.add.graphics().setScrollFactor(0);
    this.drawBarsFromFractions(1, 1);

    const w = this.scale.width;
    const h = this.scale.height;
    this.redOverlay = this.add.rectangle(0, 0, w, h, 0xdc3545, 0).setOrigin(0).setScrollFactor(0).setDepth(1000);
    this.blackOverlay = this.add.rectangle(0, 0, w, h, 0x000000, 0).setOrigin(0).setScrollFactor(0).setDepth(999);

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

  private async setupRuntime() {
    const sceneApi = new PhaserSceneApi(this);
    this.runtime = createClientRuntime(sceneApi);
    await this.runtime.loadModule(coreClientModule);
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
          void this.spawnRemote(info);
        }
      });
    });

    this.net.on('playerJoined', (info) => {
      if (info.id === this.selfId) return;
      void this.spawnRemote(info);
    });

    this.net.on('playerLeft', (id) => {
      this.removeRemote(id);
    });

    this.net.on('playerState', ({ id, state }) => {
      if (id === this.selfId) return;
      void this.spawnRemote({ id, state, inventory: { ...EMPTY_COUNTS } });
    });

    this.net.on('worldUpdate', (changes) => {
      this.clientWorld = reduceClientEvent(this.clientWorld, { type: 'world-update', changes });
      this.applyWorldChanges(changes);
    });

    this.net.on('inventoryUpdate', (msg) => {
      if (msg.id !== this.selfId) return;
      this.clientWorld = reduceClientEvent(this.clientWorld, {
        type: 'inventory-update',
        inventory: msg.inventory,
      });
      this.inv.setAll(this.clientWorld.inventory);
      this.toolbar.refreshCounts(this.inv.counts);
      this.ensureValidSelection();
    });

    this.net.on('actionDenied', (reason) => {
      console.warn('[game] action denied', reason);
      this.tools.clearTarget();
    });

    this.net.on('playerShot', (msg) => {
      this.clientWorld = reduceClientEvent(this.clientWorld, { type: 'player-shot', payload: msg });
      this.onPlayerShot(msg);
    });

    this.net.connect();
  }

  private hydrateSelf(info: PlayerInit) {
    this.player.setPosition(info.state.x, info.state.y);
    this.player.setVelocity(info.state.vx, info.state.vy);
    this.player.hp = info.state.hp;
    this.player.energy = info.state.energy;
    this.player.facing = info.state.facing;
    this.player.setFlipX(this.player.facing < 0);
    this.tools.current = info.state.currentTool;
    if (info.state.currentTool === 'shovel' || info.state.currentTool === 'pickaxe') {
      this.lastMiningTool = info.state.currentTool;
    }
    this.selectedMat = info.state.selectedMat;
    this.inv.setAll(info.inventory);
    this.toolbar.refreshCounts(this.inv.counts);
    const slot = this.resolveSlotForState(info.state);
    this.applySlotSelection(slot);
    this.drawBarsFromFractions(this.player.hp / 100, this.player.energy / 100);
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

  private async spawnRemote(info: PlayerInit): Promise<void> {
    await this.runtimeReady;
    if (!this.runtime) return;
    const wasMounted = this.remotePlayers.has(info.id);
    this.remotePlayers.set(info.id, info.state);
    if (!wasMounted) {
      await this.runtime.mount(PLAYER_KIND, info.id);
    }
    this.runtime.update(info.id, {
      x: info.state.x,
      y: info.state.y,
      facing: info.state.facing,
      speed: Math.hypot(info.state.vx ?? 0, info.state.vy ?? 0),
    });
  }

  private removeRemote(id: string) {
    if (!this.remotePlayers.has(id)) return;
    this.runtime?.unmount(id);
    this.remotePlayers.delete(id);
  }

  private applyWorldChanges(changes: BlockChange[]) {
    if (changes.length === 0) return;
    this.cm.applyBlockChanges(changes);
  }

  private drawBarsFromFractions(hpFrac: number, energyFrac: number) {
    const x = 8, yHp = 8, yEn = 22;
    const w = 200, h = 10;

    this.hpBg.clear().fillStyle(0x222222, 1).fillRect(x - 1, yHp - 1, w + 2, h + 2);
    this.enBg.clear().fillStyle(0x222222, 1).fillRect(x - 1, yEn - 1, w + 2, h + 2);

    const clampedHp = Math.max(0, Math.min(1, hpFrac));
    const clampedEn = Math.max(0, Math.min(1, energyFrac));

    this.hpFg.clear().fillStyle(0xdc3545, 1).fillRect(x, yHp, w * clampedHp, h);
    this.enFg.clear().fillStyle(0x1e90ff, 1).fillRect(x, yEn, w * clampedEn, h);
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

      const mineState: MineState = {
        tool: this.tools.current,
        lastMiningTool: this.lastMiningTool,
        target:
          this.tools.targetTile && this.tools.targetMat
            ? {
                tileX: this.tools.targetTile.x,
                tileY: this.tools.targetTile.y,
                material: this.tools.targetMat,
                strikesLeft: this.tools.targetStrikesLeft,
              }
            : null,
      };

      const mineResult = applyMineAction(mineState, { tileX, tileY, material: mat });

      this.lastMiningTool = mineResult.state.lastMiningTool;
      this.tools.applyTarget(mineResult.state.target);

      if (mineResult.strikesConsumed > 0) {
        this.player.useEnergy(0.5 * mineResult.strikesConsumed);
        this.miningNow = true;
        const s = info.chunk.sprites[info.by][info.bx];
        if (s) this.tweens.add({ targets: s, alpha: 0.5, yoyo: true, duration: 60, repeat: 0 });
        this.drawBarsFromFractions(this.player.hp / 100, this.player.energy / 100);
      }

      if (mineResult.request) {
        this.net.requestMine(mineResult.request.tileX, mineResult.request.tileY);
      }
    }

    if (pointer.rightButtonDown()) {
      if (distance > reach) return;

      const placementEval = evaluatePlacementAction(
        { selectedMat: this.selectedMat, inventory: this.inv.counts },
        tileX,
        tileY,
      );

      if (!placementEval.ok || !placementEval.request) return;

      const overlap = this.physics.overlapRect(tileX * TILE, tileY * TILE, TILE, TILE, true, true);
      const overlapsPlayer = overlap.some((candidate) => candidate.gameObject === this.player);
      if (overlapsPlayer) return;

      const existing = this.cm.getBlockDataAtTile(tileX, tileY);
      if (!existing || existing.data.mat !== 'air') return;

      this.net.requestPlace(
        placementEval.request.tileX,
        placementEval.request.tileY,
        placementEval.request.material,
      );
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

    this.drawBarsFromFractions(this.player.hp / 100, this.player.energy / 100);
    this.tools.clearTarget();
  }

  private spawnBullet(ownerId: string | null, originX: number, originY: number, dirX: number, dirY: number, distance?: number) {
    const bullet = this.physics.add.image(originX, originY, 'bullet');
    bullet.setDepth(450);
    bullet.setActive(true);
    bullet.setVisible(true);
    bullet.setCollideWorldBounds(true);
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(true);
    body.setGravityY(RIFLE_BULLET_GRAVITY);
    const vx = dirX * this.bulletSpeed;
    const vy = dirY * this.bulletSpeed;
    body.setVelocity(vx, vy);
    body.setSize(12, 4);
    body.setOffset(0, 0);
    body.onWorldBounds = true;
    const maxDistance = distance ?? this.rifleMaxDistance;
    const lifespanMs = (maxDistance / this.bulletSpeed) * 1000;
    const existingTimer = bullet.getData('expireEvent') as Phaser.Time.TimerEvent | undefined;
    existingTimer?.remove();
    const expireEvent = this.time.delayedCall(lifespanMs, () => this.destroyBullet(bullet));
    bullet.setData('expireEvent', expireEvent);
    bullet.setData('ownerId', ownerId ?? '');
    bullet.rotation = Math.atan2(vy, vx);
    this.bullets.add(bullet);
  }

  private alignBulletRotation() {
    const bullets = this.bullets.getChildren() as Phaser.Physics.Arcade.Image[];
    for (const bullet of bullets) {
      if (!bullet.active) continue;
      const body = bullet.body as Phaser.Physics.Arcade.Body;
      bullet.rotation = Math.atan2(body.velocity.y, body.velocity.x);
    }
  }

  private destroyBullet(bullet: Phaser.Physics.Arcade.Image) {
    const expireEvent = bullet.getData('expireEvent') as Phaser.Time.TimerEvent | undefined;
    expireEvent?.remove();
    bullet.setData('expireEvent', null);
    this.bullets.remove(bullet, true, true);
  }

  private onPlayerShot(msg: PlayerShotMessage) {
    if (!Number.isFinite(msg.dirX) || !Number.isFinite(msg.dirY)) return;

    const ownerIsSelf = msg.shooterId === this.selfId;
    if (!ownerIsSelf) {
      const distance = this.estimateHitDistance(msg);
      this.spawnBullet(msg.shooterId, msg.originX, msg.originY, msg.dirX, msg.dirY, distance ?? this.rifleMaxDistance);
    } else if (msg.hitId) {
      this.trimOwnBullet(msg);
    }

    if (msg.hitId === this.selfId) {
      this.player.hp = 0;
      this.drawBarsFromFractions(this.player.hp / 100, this.player.energy / 100);
      this.showRedDeathFade();
    }
  }

  private estimateHitDistance(msg: PlayerShotMessage): number | null {
    if (!msg.hitId) return null;
    if (msg.hitId === this.selfId) {
      return Phaser.Math.Distance.Between(msg.originX, msg.originY, this.player.x, this.player.y);
    }
    const remote = this.remotePlayers.get(msg.hitId);
    if (remote) {
      return Phaser.Math.Distance.Between(msg.originX, msg.originY, remote.x, remote.y);
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
  }

  private respawnPlayer() {
    const tileX = Math.floor(this.player.x / TILE);
    const { groundY } = this.cm.terrain.profileAt(tileX);
    const spawnY = (groundY - 2) * TILE;

    this.player.setPosition(this.player.x, spawnY);
   this.player.setVelocity(0, 0);
   this.player.hp = 100;
   this.player.energy = 100;
    this.drawBarsFromFractions(1, 1);

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
    const energyResult = advanceEnergy(
      {
        energy: this.player.energy,
        hp: this.player.hp,
        accumMoveMs: this.accumMsMove,
        accumIdleMs: this.accumMsIdle,
      },
      {
        moving,
        mining: this.miningNow,
        deltaMs: delta,
        drainFactor,
      },
    );

    this.player.energy = energyResult.energy;
    this.player.hp = energyResult.hp;
    this.accumMsMove = energyResult.accumMoveMs;
    this.accumMsIdle = energyResult.accumIdleMs;

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

    if (this.player.hp <= 0) this.showRedDeathFade();
    this.updateBlackout();

    const activeLabel = this.activeItem ? this.activeItem.label : '—';
    const hudState = deriveHudState({
      hp: this.player.hp,
      energy: this.player.energy,
      activeLabel,
      selectedMaterial: this.selectedMat ?? '—',
      weight,
      speedFactor,
    });
    this.hudText.setText(hudState.text);
    this.drawBarsFromFractions(hudState.hpFraction, hudState.energyFraction);

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
    };
    this.net.sendState(payload);
  }
}
const EMPTY_COUNTS: InventoryCounts = {
  grass: 0,
  dirt: 0,
  rock: 0,
  wood: 0,
  coal: 0,
  copper: 0,
  silver: 0,
  gold: 0,
  diamond: 0,
};
