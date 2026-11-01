import { io, type Socket } from 'socket.io-client';
import { tokenStore } from '@/lib/api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ auth: (cb) => cb({ token: tokenStore.get() }), transports: ['websocket', 'polling'] });
  }
  return socket;
}

/** Reconecta com o token novo (login/logout) para entrar/sair da sala privada do usuário. */
export function resetSocketAuth() {
  if (socket) {
    socket.disconnect();
    socket.connect();
  }
}
