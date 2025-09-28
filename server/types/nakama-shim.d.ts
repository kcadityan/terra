declare module '@heroiclabs/nakama-js' {
  export class Client {
    constructor(serverKey: string, host: string, port?: string, useSSL?: boolean);
    authenticateCustom(id: string, create?: boolean): Promise<any>;
    readStorageObjects(
      session: any,
      objects: Array<{ collection: string; key: string; userId: string }>
    ): Promise<{ objects: Array<{ value: any; version?: string }> }>;
    writeStorageObjects(
      session: any,
      objects: Array<{
        collection: string;
        key: string;
        value: any;
        permissionRead?: number;
        permissionWrite?: number;
        version?: string;
      }>
    ): Promise<void>;
  }

  export interface Session {
    user_id: string;
    refresh_token?: string;
    isexpired(time: number): boolean;
  }
}
