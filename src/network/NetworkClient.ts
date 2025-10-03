import { Client as ColyseusClient, Room } from 'colyseus.js';
import {
  DEFAULT_PORT,
  type BlockChange,
  type InventoryUpdateMessage,
  type PlayerInit,
  type PlayerState,
  type ServerMessage,
  type WelcomeMessage,
  type PlayerShotMessage,
} from '../../engine/shared/protocol';

interface EventMap {
  welcome: WelcomeMessage;
  playerJoined: PlayerInit;
  playerLeft: string;
  playerState: { id: string; state: PlayerState };
  worldUpdate: BlockChange[];
  inventoryUpdate: InventoryUpdateMessage;
  actionDenied: string;
  disconnected: void;
  playerShot: PlayerShotMessage;
}

type Listener<K extends keyof EventMap> = (payload: EventMap[K]) => void;

export class NetworkClient {
  private client: ColyseusClient | null = null;
  private room: Room | null = null;
  private connecting = false;
  private listeners = {
    welcome: new Set<Listener<'welcome'>>(),
    playerJoined: new Set<Listener<'playerJoined'>>(),
    playerLeft: new Set<Listener<'playerLeft'>>(),
    playerState: new Set<Listener<'playerState'>>(),
    worldUpdate: new Set<Listener<'worldUpdate'>>(),
    inventoryUpdate: new Set<Listener<'inventoryUpdate'>>(),
    actionDenied: new Set<Listener<'actionDenied'>>(),
    disconnected: new Set<Listener<'disconnected'>>(),
    playerShot: new Set<Listener<'playerShot'>>(),
  } as { [K in keyof EventMap]: Set<Listener<K>> };

  selfId: string | null = null;
  seed: number | null = null;
  connected = false;

  connect(url?: string) {
    if (this.room || this.connecting) return;
    this.connecting = true;
    void this.open(url);
  }

  private async open(url?: string) {
    try {
      const target = this.resolveUrl(url);
      this.client = new ColyseusClient(target);
      const room = await this.client.joinOrCreate('terra');
      this.room = room;
      this.connected = true;
      this.connecting = false;

      room.onMessage('message', (message) => {
        this.handleServerMessage(message as ServerMessage);
      });

      room.onLeave(() => {
        this.handleDisconnect();
      });

      room.onError((code, message) => {
        console.error('[network] room error', code, message);
        this.handleDisconnect();
      });

      room.send('hello', {});
    } catch (err) {
      console.error('[network] failed to connect via Colyseus', err);
      this.connecting = false;
      this.connected = false;
      this.emit('disconnected', undefined);
    }
  }

  private resolveUrl(url?: string): string {
    if (url) return url;
    const hostname = window.location.hostname || 'localhost';
    const env = (import.meta as any)?.env ?? {};
    const envUrl = (env.VITE_TERRA_WS_URL as string | undefined)?.trim();
    const envPort = (env.VITE_TERRA_PORT as string | undefined)?.trim();
    if (envUrl && envUrl.length > 0) return envUrl;
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const port = envPort && envPort.length > 0 ? envPort : `${DEFAULT_PORT}`;
    return `${protocol}://${hostname}:${port}`;
  }

  private handleDisconnect() {
    if (!this.connected && !this.room) {
      this.connecting = false;
      return;
    }
    this.connected = false;
    this.selfId = null;
    this.seed = null;
    this.room = null;
    this.client = null;
    this.connecting = false;
    this.emit('disconnected', undefined);
  }

  on<K extends keyof EventMap>(event: K, cb: Listener<K>): () => void {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]) {
    for (const cb of this.listeners[event]) {
      cb(payload);
    }
  }

  private send<T>(type: string, payload: T) {
    if (!this.room) return;
    this.room.send(type, payload);
  }

  sendState(state: PlayerState) {
    this.send('state', { state });
  }

  requestMine(tileX: number, tileY: number) {
    this.send('mine-block', { tileX, tileY });
  }

  requestPlace(tileX: number, tileY: number, mat: PlayerState['selectedMat']) {
    if (!mat) return;
    this.send('place-block', { tileX, tileY, mat });
  }

  sendShoot(originX: number, originY: number, dirX: number, dirY: number) {
    this.send('shoot', { originX, originY, dirX, dirY });
  }

  private handleServerMessage(msg: ServerMessage) {
    switch (msg.type) {
      case 'welcome': {
        this.selfId = msg.selfId;
        this.seed = msg.seed;
        this.emit('welcome', msg);
        break;
      }
      case 'player-joined': {
        this.emit('playerJoined', msg.player);
        break;
      }
      case 'player-left': {
        this.emit('playerLeft', msg.id);
        break;
      }
      case 'player-state': {
        this.emit('playerState', { id: msg.id, state: msg.state });
        break;
      }
      case 'world-update': {
        this.emit('worldUpdate', msg.changes);
        break;
      }
      case 'inventory-update': {
        this.emit('inventoryUpdate', msg);
        break;
      }
      case 'player-shot': {
        this.emit('playerShot', msg);
        break;
      }
      case 'action-denied': {
        this.emit('actionDenied', msg.reason);
        break;
      }
      default: {
        const exhaustive: never = msg;
        console.warn('[network] unhandled message', exhaustive);
      }
    }
  }
}
