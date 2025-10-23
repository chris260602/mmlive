const mediasoup = require('mediasoup');


let worker;
// Using a Map to store rooms instead of an object for better performance with frequent additions/deletions.
let rooms = new Map(); // rooms: Map<roomName, { router: Router, peers: Map<socketId, Peer> }>

// This function starts the Mediasoup worker.
const createWorker = async () => {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
  });

  console.log(`Mediasoup worker started with pid ${worker.pid}`);

  worker.on('died', () => {
    console.error('Mediasoup worker has died');
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
};

// We run this once at startup.
createWorker();

// Helper function to get or create a room.
// In a real app, this would be more dynamic.
const getOrCreateRoom = async (roomName) => {
    let room = rooms.get(roomName);
    if (!room) {
        console.log(`Creating room: ${roomName}`);
        const mediaCodecs = [
          { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
          { kind: 'video', mimeType: 'video/VP8', clockRate: 90000, parameters: { 'x-google-start-bitrate': 1000 } },
        ];
        const router = await worker.createRouter({ mediaCodecs });
        room = { router, peers: new Map() };
        rooms.set(roomName, room);
    }
    return room;
};


// --- Peer and Resource Management ---

const addPeer = (socket, room) => {
  room.peers.set(socket.id, {
    socket,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
  });
};

const getPeer = (socketId) => {
  for (const room of rooms.values()) {
    if (room.peers.has(socketId)) {
      return room.peers.get(socketId);
    }
  }
};

const getRoomFromSocketId = (socketId) => {
  for (const [name, room] of rooms.entries()) {
    if (room.peers.has(socketId)) {
      return { name, room };
    }
  }
  return { name: null, room: null };
}

// Clean up when a peer disconnects
const removePeer = (socketId) => {
  const { name, room } = getRoomFromSocketId(socketId);
  if (!room) return;

  const peer = room.peers.get(socketId);
  if (!peer) return;

  console.log(`Peer ${socketId} disconnected, cleaning up...`);
  // Close all their transports, which will also close producers/consumers
  for (const transport of peer.transports.values()) {
    transport.close();
  }
  
  room.peers.delete(socketId);
  console.log(`Peer ${socketId} removed from room ${name}`);
};

// --- Socket.IO Connection Handling ---

io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    removePeer(socket.id);
  });
  
  // Client wants to join a room
  socket.on('joinRoom', async (roomName, callback) => {
    try {
        const room = await getOrCreateRoom(roomName);
        socket.join(roomName);
        addPeer(socket, room);

        // Inform the new peer about existing producers in the room
        const existingProducerIds = [];
        for (const peer of room.peers.values()) {
            if (peer.socket.id !== socket.id) {
                for (const producer of peer.producers.values()) {
                    existingProducerIds.push(producer.id);
                }
            }
        }
        
        callback({ 
          rtpCapabilities: room.router.rtpCapabilities,
          existingProducerIds
        });
    } catch(e) {
        console.error('Error joining room:', e);
        callback({ error: e.message });
    }
  });

  // Client wants to create a transport
  socket.on('createWebRtcTransport', async ({ isSender }, callback) => {
    try {
        const { room } = getRoomFromSocketId(socket.id);
        if (!room) throw new Error('Not in a room');

        const transport = await room.router.createWebRtcTransport({
            listenIps: [{ ip: '127.0.0.1', announcedIp: null }],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        });

        const peer = room.peers.get(socket.id);
        peer.transports.set(transport.id, transport);

        callback({
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            },
        });
    } catch (error) {
        console.error('Failed to create WebRTC transport:', error);
        callback({ error: error.message });
    }
  });
  
  // Client wants to connect a transport
  socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
    const peer = getPeer(socket.id);
    if (!peer) return callback({ error: 'Peer not found' });
    
    const transport = peer.transports.get(transportId);
    if (!transport) return callback({ error: `Transport with id "${transportId}" not found` });

    await transport.connect({ dtlsParameters });
    callback({}); // Signal success
  });

  // Client wants to produce media
  socket.on('produce', async ({ kind, rtpParameters, transportId, roomName }, callback) => {
    try {
        const peer = getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });

        const transport = peer.transports.get(transportId);
        if (!transport) return callback({ error: `Transport with id "${transportId}" not found` });

        const producer = await transport.produce({ kind, rtpParameters });
        peer.producers.set(producer.id, producer);

        // Inform all other clients in the room that a new producer is available.
        socket.to(roomName).emit('new-producer', { producerId: producer.id });
        
        callback({ id: producer.id });
    } catch (e) {
        console.error('Error producing:', e);
        callback({ error: e.message });
    }
  });

  // Client wants to consume media
  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    try {
        const peer = getPeer(socket.id);
        if (!peer) return callback({ error: 'Peer not found' });
        
        const { room } = getRoomFromSocketId(socket.id);
        if (!room) return callback({ error: 'Not in a room' });

        const transport = peer.transports.get(transportId);
        if (!transport) return callback({ error: `Transport with id "${transportId}" not found` });

        if (!room.router.canConsume({ producerId, rtpCapabilities })) {
            return callback({ error: 'Cannot consume this producer' });
        }

        const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
        });
        peer.consumers.set(consumer.id, consumer);
        
        consumer.on('producerclose', () => {
            console.log(`Consumer's producer closed: ${consumer.id}`);
            socket.emit('consumer-closed', { consumerId: consumer.id });
            consumer.close();
            peer.consumers.delete(consumer.id);
        });

        callback({
            params: {
                id: consumer.id,
                producerId,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters,
            }
        });
    } catch (error) {
        console.error('Error creating consumer:', error);
        callback({ error: error.message });
    }
  });
  
  // Client is ready to receive media for a consumer
  // FIX: The client does not send a callback for this event, so we remove it from the handler.
  socket.on('resume', async ({ consumerId }) => {
    const peer = getPeer(socket.id);
    if (!peer) {
        console.error(`Peer not found for socket ID: ${socket.id} during resume`);
        return;
    }
    
    const consumer = peer.consumers.get(consumerId);
    if (consumer) {
        try {
            await consumer.resume();
            console.log(`Resumed consumer ${consumer.id}`);
        } catch (error) {
            console.error(`Error resuming consumer ${consumer.id}:`, error);
        }
    } else {
        console.warn(`Consumer not found for ID: ${consumerId} during resume`);
    }
  });
});