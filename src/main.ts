import Phaser from 'phaser';
import GameScene from './scene/GameScene';

const WIDTH = 960;
const HEIGHT = 540;

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'app',
  width: WIDTH,
  height: HEIGHT,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 900 },
      debug: false
    }
  },
  scene: [GameScene],
  backgroundColor: '#0e0e12'
};

new Phaser.Game(config);
