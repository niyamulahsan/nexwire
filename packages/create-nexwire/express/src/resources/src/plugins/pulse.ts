import { io, type Socket } from "socket.io-client";
import type { App } from "vue";

declare const __SOCKET_ENABLED__: boolean;

type EventCallback<T = unknown> = (payload: T) => void;

type ChannelBinding = {
  event: string;
  callback: EventCallback;
  wrapped: EventCallback;
};

type PulseChannel = {
  listen: <T = unknown>(event: string, callback: EventCallback<T>) => PulseChannel;
  stopListening: (event: string, callback?: EventCallback) => PulseChannel;
};

export type PulseClient = {
  connect: () => PulseClient;
  disconnect: () => PulseClient;
  channel: (name: string) => PulseChannel;
  private: (room: string) => PulseChannel;
  leave: (room: string) => PulseClient;
};

function createPulse(): PulseClient {
  if (!__SOCKET_ENABLED__) {
    const n = (): PulseChannel => ({ listen: () => n(), stopListening: () => n() });
    const c: PulseClient = {
      connect: () => c,
      disconnect: () => c,
      channel: n,
      private: n,
      leave: () => c
    };
    return c;
  }
  let socket: Socket | null = null;
  const channels = new Map<string, ChannelBinding[]>();
  const joinedRooms = new Set<string>();

  const socketUrl = () => {
    const explicit = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL;
    if (explicit) return explicit;
    return window.location.origin;
  };

  const ensureConnected = () => {
    if (socket) return socket;

    socket = io(socketUrl(), {
      withCredentials: true,
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      for (const room of joinedRooms) {
        socket?.emit("join", room);
      }
    });

    return socket;
  };

  const channel = (name: string): PulseChannel => {
    const room = String(name).trim();
    if (!room) throw new Error("Channel name is required");

    const currentSocket = ensureConnected();
    joinedRooms.add(room);
    currentSocket.emit("join", room);

    const api: PulseChannel = {
      listen: <T = unknown>(event: string, callback: EventCallback<T>) => {
        const wrapped = (payload: unknown) => callback(payload as T);
        const bindings = channels.get(room) || [];
        bindings.push({ event, callback: callback as EventCallback, wrapped });
        channels.set(room, bindings);
        currentSocket.on(event, wrapped);
        return api;
      },
      stopListening: (event: string, callback?: EventCallback) => {
        const bindings = channels.get(room) || [];
        const kept: ChannelBinding[] = [];

        for (const binding of bindings) {
          const matchesEvent = binding.event === event;
          const matchesCallback = !callback || binding.callback === callback;
          if (matchesEvent && matchesCallback) {
            currentSocket.off(binding.event, binding.wrapped);
          } else {
            kept.push(binding);
          }
        }

        if (kept.length > 0) channels.set(room, kept);
        else channels.delete(room);
        return api;
      }
    };

    return api;
  };

  const pulse: PulseClient = {
    connect: () => {
      ensureConnected();
      return pulse;
    },
    disconnect: () => {
      socket?.disconnect();
      socket = null;
      return pulse;
    },
    channel,
    private: (room: string) => channel(`private:${room}`),
    leave: (room: string) => {
      if (!socket) return pulse;

      const bindings = channels.get(room) || [];
      for (const binding of bindings) {
        socket.off(binding.event, binding.wrapped);
      }

      channels.delete(room);
      joinedRooms.delete(room);
      return pulse;
    }
  };

  return pulse;
}

export const pulse = createPulse();

export const PulsePlugin = {
  install(app: App) {
    app.config.globalProperties.$pulse = pulse;
  }
};

declare module "vue" {
  interface ComponentCustomProperties {
    $pulse: PulseClient;
  }
}
