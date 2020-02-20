import { Injectable, Optional, SkipSelf, Provider } from '@angular/core';
import { Observable } from 'rxjs';
import { tap, mapTo } from 'rxjs/operators';
import { VantageQueryService, ISQLEConnection } from './query.service';
import { VantageSessionService } from '@td-vantage/ui-platform/auth';

const CONNECTION_SESSION_KEY: string = 'vantage.connections';

interface IVantageConnectionsMap {
  [systemId: string]: ISQLEConnection;
}

interface IVantageConnectionState {
  username: string;
  current?: string; // id of current connection
  connections: IVantageConnectionsMap;
}

@Injectable()
export class VantageConnectionService {
  constructor(private _queryService: VantageQueryService, private _sessionService: VantageSessionService) {}

  public get current(): ISQLEConnection {
    this._validateConnectionUser();

    const connections: IVantageConnectionState = this._getConnectionState();
    if (connections && connections.current) {
      return connections.connections[connections.current];
    }
    return undefined;
  }

  public connect(connection: ISQLEConnection): Observable<ISQLEConnection> {
    this._validateConnectionUser();

    // clear connection before starting a new one
    this.disconnect();
    // test connection with SELECT 1
    return this._queryService.querySystem(connection, { query: 'SELECT 1;' }).pipe(
      tap(() => {
        this.addConnection(connection);
      }), // if successful, save
      mapTo(connection),
    );
  }

  public disconnect(): void {
    this._validateConnectionUser();

    const connections: IVantageConnectionState = this._getConnectionState();
    if (connections) {
      connections.current = undefined;
      // for now just clear out connections
      // but in the future could leave connection and just set current to undefined
      // would require a remove connection method
      connections.connections = {};
    }
    this._saveToSession(connections);
  }

  private get _currentUsername(): string {
    return this._sessionService.user.username;
  }

  private _validateConnectionUser(): void {
    const connectionState: IVantageConnectionState = this._getConnectionState();
    if (connectionState && connectionState.username !== this._currentUsername) {
      // mismatch, clear
      this._clearConnectionState();
    }
  }

  private addConnection(connection: ISQLEConnection): void {
    const connectionSate: IVantageConnectionState = this._getConnectionState();
    const {
      system: { id },
    } = connection;
    connectionSate.username = this._currentUsername;
    connectionSate.connections[id] = connection;
    connectionSate.current = id;
    this._saveToSession(connectionSate);
  }

  private _getConnectionState(): IVantageConnectionState {
    const connectionState: IVantageConnectionState = this._getFromSession();
    if (
      connectionState &&
      connectionState.connections &&
      typeof connectionState.connections === 'object' &&
      connectionState.username &&
      typeof connectionState.username === 'string'
    ) {
      return connectionState;
    }
    return {
      username: undefined,
      current: undefined,
      connections: {},
    };
  }

  private _clearConnectionState(): void {
    this._saveToSession(undefined);
  }

  private _getFromSession(): IVantageConnectionState {
    try {
      return JSON.parse(sessionStorage.getItem(CONNECTION_SESSION_KEY));
    } catch {
      return undefined;
    }
  }

  private _saveToSession(item: IVantageConnectionState): void {
    sessionStorage.setItem(CONNECTION_SESSION_KEY, JSON.stringify(item));
  }
}

export function VANTAGE_CONNECTION_PROVIDER_FACTORY(
  parent: VantageConnectionService,
  queryService: VantageQueryService,
  sessionService: VantageSessionService,
): VantageConnectionService {
  return parent || new VantageConnectionService(queryService, sessionService);
}

export const VANTAGE_CONNECTION_PROVIDER: Provider = {
  // If there is already a service available, use that. Otherwise, provide a new one.
  provide: VantageConnectionService,
  deps: [[new Optional(), new SkipSelf(), VantageConnectionService], VantageQueryService],
  useFactory: VANTAGE_CONNECTION_PROVIDER_FACTORY,
};
