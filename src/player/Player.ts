import Phaser from 'phaser';
import { TILE } from '../shared/game-types';

export class Player extends Phaser.Physics.Arcade.Sprite {
  facing: 1 | -1 = 1;

  // Stats
  hp = 100;        // 0..100
  energy = 100;    // 0..100

  // Fall tracking
  private airborne = false;
  private minYWhileAirborne = 0; // apex (smallest y)
  private maxYWhileAirborne = 0; // lowest point before landing

  // Load/speed scaling
  private baseAccel = 900;
  private baseMaxVx = 260;
  private speedFactor = 1; // 0.6..1 typically

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(false);
    this.setMaxVelocity(this.baseMaxVx, 800);
    this.setDragX(1000);
    this.setBounce(0);
    (this.body as Phaser.Physics.Arcade.Body).setSize(TILE * 0.6, TILE * 0.9);
    this.setOrigin(0.5, 0.5);
  }

  setLoadFactor(f: number) {
    this.speedFactor = Math.max(0.4, Math.min(1, f));
    this.setMaxVelocity(this.baseMaxVx * this.speedFactor, 800);
  }

  moveLeft() { this.setAccelerationX(-this.baseAccel * this.speedFactor); this.facing = -1; }
  moveRight() { this.setAccelerationX(this.baseAccel * this.speedFactor); this.facing = 1; }
  stopH() { this.setAccelerationX(0); }
  tryJump() {
    const onGround = (this.body as Phaser.Physics.Arcade.Body).blocked.down;
    if (onGround) this.setVelocityY(-380);
  }

  // Energy helpers
  useEnergy(amount: number) {
    this.energy = Math.max(0, Math.min(100, this.energy - amount));
  }
  gainEnergy(amount: number) {
    this.energy = Math.max(0, Math.min(100, this.energy + amount));
  }

  // Damage helpers
  takeDamage(amount: number) {
    this.hp = Math.max(0, Math.min(100, this.hp - amount));
  }
  heal(amount: number) {
    this.hp = Math.max(0, Math.min(100, this.hp + amount));
  }

  /**
   * Call once per frame. Detects landing events and returns fall damage (if any).
   * Fall damage rule: no damage for first 2 blocks; each extra block = 5 dmg.
   */
  updateFallTracker(): number {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const onGround = body.blocked.down;

    if (!this.airborne && !onGround) {
      // just left ground
      this.airborne = true;
      this.minYWhileAirborne = this.y;
      this.maxYWhileAirborne = this.y;
    }

    if (this.airborne) {
      if (this.y < this.minYWhileAirborne) this.minYWhileAirborne = this.y; // went higher
      if (this.y > this.maxYWhileAirborne) this.maxYWhileAirborne = this.y; // fell further
    }

    if (this.airborne && onGround) {
      // landed -> compute fall distance from apex to landing
      this.airborne = false;
      const fallDistPx = this.maxYWhileAirborne - this.minYWhileAirborne;
      const blocks = fallDistPx / TILE;
      const over = Math.floor(blocks - 2); // damage only for blocks beyond 2
      if (over > 0) {
        return over * 5;
      }
    }

    return 0;
  }
}
