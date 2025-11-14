import { io, Socket } from 'socket.io-client';

class SocketManager {
    socket: Socket | null;

    constructor() {
      this.socket = null;
    }

  connect() {
    if (this.socket) return this.socket;

    this.socket = io('http://localhost:3001', {
      autoConnect: false,
    });

    this.socket.connect();
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  emit(event, data) {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

export default new SocketManager();