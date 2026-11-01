import { EventEmitter } from 'node:events';

/** Eventos de domínio emitidos pelos serviços após o COMMIT; a camada realtime os repassa via Socket.IO. */
export interface DomainEvents {
  'bid.placed': { lotId: string; bidderId: string; previousLeaderId: string | null; extended: boolean };
  'lot.created': { lotId: string };
  'lot.cancelled': { lotId: string; affectedUserIds: string[] };
  'lot.settled': { lotId: string; winnerId: string | null; sellerId: string };
  'wallet.changed': { userIds: string[] };
}

class TypedBus extends EventEmitter {
  emitEvent<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]) {
    this.emit(event, payload);
  }
  onEvent<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void) {
    this.on(event, listener);
  }
}

export const events = new TypedBus();
