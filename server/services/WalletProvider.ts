export interface WalletProvider {
  init(): Promise<void>;
  ensurePlayer(playerId: string): Promise<number>;
  getBalance(playerId: string): Promise<number>;
  addCurrency(playerId: string, delta: number): Promise<number>;
  setBalance(playerId: string, value: number): Promise<void>;
}

class MemoryWalletProvider implements WalletProvider {
  private balances = new Map<string, number>();

  async init(): Promise<void> {}

  async ensurePlayer(playerId: string): Promise<number> {
    return this.getBalance(playerId);
  }

  async getBalance(playerId: string): Promise<number> {
    return this.balances.get(playerId) ?? 0;
  }

  async addCurrency(playerId: string, delta: number): Promise<number> {
    const next = Math.max(0, (await this.getBalance(playerId)) + delta);
    this.balances.set(playerId, next);
    return next;
  }

  async setBalance(playerId: string, value: number): Promise<void> {
    this.balances.set(playerId, Math.max(0, value));
  }
}

interface NakamaConfig {
  host: string;
  port: string;
  useSSL: boolean;
  serverKey: string;
}

type StorageRecord = { balance: number };

class NakamaWalletProvider implements WalletProvider {
  private memoryFallback = new MemoryWalletProvider();
  private client: any = null;
  private sessions = new Map<string, any>();
  private failed = false;
  private readonly collection = 'wallet';
  private readonly key = 'currency';

  constructor(private config: NakamaConfig | null) {}

  async init(): Promise<void> {
    await this.memoryFallback.init();
    if (!this.config) {
      this.failed = true;
      return;
    }

    try {
      const { Client } = await import('@heroiclabs/nakama-js');
      const { default: fetchImpl } = await import('node-fetch');
      const { default: WebSocketImpl } = await import('ws');
      if (typeof (globalThis as any).fetch !== 'function') {
        (globalThis as any).fetch = fetchImpl as unknown as typeof fetch;
      }
      if (!(globalThis as any).WebSocket) {
        (globalThis as any).WebSocket = WebSocketImpl as unknown as typeof WebSocket;
      }
      this.client = new Client(
        this.config.serverKey,
        this.config.host,
        this.config.port,
        this.config.useSSL
      );
    } catch (err) {
      console.error('[wallet] failed to initialize Nakama client, falling back to memory store', err);
      this.client = null;
      this.failed = true;
    }
  }

  async ensurePlayer(playerId: string): Promise<number> {
    try {
      const session = await this.getSession(playerId);
      if (!session) return this.memoryFallback.ensurePlayer(playerId);
      const { balance } = await this.readBalance(session);
      return balance;
    } catch (err) {
      this.markFailed(err);
      return this.memoryFallback.ensurePlayer(playerId);
    }
  }

  async getBalance(playerId: string): Promise<number> {
    if (this.failed) return this.memoryFallback.getBalance(playerId);
    try {
      const session = await this.getSession(playerId);
      if (!session) return this.memoryFallback.getBalance(playerId);
      const { balance } = await this.readBalance(session);
      return balance;
    } catch (err) {
      this.markFailed(err);
      return this.memoryFallback.getBalance(playerId);
    }
  }

  async addCurrency(playerId: string, delta: number): Promise<number> {
    if (this.failed) return this.memoryFallback.addCurrency(playerId, delta);
    try {
      const session = await this.getSession(playerId);
      if (!session) return this.memoryFallback.addCurrency(playerId, delta);
      const record = await this.readBalance(session);
      const next = Math.max(0, record.balance + delta);
      await this.writeBalance(session, next, record.version);
      await this.memoryFallback.setBalance(playerId, next);
      return next;
    } catch (err) {
      this.markFailed(err);
      return this.memoryFallback.addCurrency(playerId, delta);
    }
  }

  async setBalance(playerId: string, value: number): Promise<void> {
    if (this.failed) {
      await this.memoryFallback.setBalance(playerId, value);
      return;
    }
    try {
      const session = await this.getSession(playerId);
      if (!session) {
        await this.memoryFallback.setBalance(playerId, value);
        return;
      }
      const record = await this.readBalance(session);
      await this.writeBalance(session, Math.max(0, value), record.version);
      await this.memoryFallback.setBalance(playerId, Math.max(0, value));
    } catch (err) {
      this.markFailed(err);
      await this.memoryFallback.setBalance(playerId, value);
    }
  }

  private async getSession(playerId: string) {
    if (!this.client) return null;
    const now = Date.now() / 1000;
    let session = this.sessions.get(playerId);
    if (session && !session.isexpired(now)) {
      return session;
    }
    session = await this.client.authenticateCustom(playerId, true);
    this.sessions.set(playerId, session);
    return session;
  }

  private async readBalance(session: any): Promise<{ balance: number; version: string | undefined }> {
    if (!this.client) return { balance: 0, version: undefined };
    const response = await this.client.readStorageObjects(session, [
      { collection: this.collection, key: this.key, userId: session.user_id },
    ]);
    const record = response.objects?.[0];
    if (!record) {
      return { balance: 0, version: undefined };
    }
    let balance = 0;
    try {
      if (typeof record.value === 'string') {
        const parsed = JSON.parse(record.value) as StorageRecord;
        balance = Number(parsed.balance ?? 0);
      } else if (record.value) {
        balance = Number((record.value as StorageRecord).balance ?? 0);
      }
    } catch (err) {
      console.warn('[wallet] failed to parse Nakama wallet value; resetting to 0', err);
      balance = 0;
    }
    return { balance: Number.isFinite(balance) ? balance : 0, version: record.version };
  }

  private async writeBalance(session: any, balance: number, version?: string) {
    if (!this.client) return;
    await this.client.writeStorageObjects(session, [
      {
        collection: this.collection,
        key: this.key,
        value: { balance },
        permissionRead: 1,
        permissionWrite: 0,
        version,
      },
    ]);
  }

  private markFailed(err: unknown) {
    if (!this.failed) {
      console.error('[wallet] Nakama provider error, switching to in-memory store', err);
    }
    this.failed = true;
  }
}

export function createWalletProvider(): WalletProvider {
  const host = process.env.NAKAMA_HOST;
  const serverKey = process.env.NAKAMA_SERVER_KEY;
  if (!host || !serverKey) {
    const memory = new MemoryWalletProvider();
    void memory.init();
    return memory;
  }

  const port = process.env.NAKAMA_PORT ?? '7350';
  const useSSL = (process.env.NAKAMA_SSL ?? '').toLowerCase() === 'true';
  const nakamaProvider = new NakamaWalletProvider({ host, port, useSSL, serverKey });
  void nakamaProvider.init();
  return nakamaProvider;
}
