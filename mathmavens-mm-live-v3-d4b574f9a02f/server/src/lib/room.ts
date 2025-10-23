const config = require('../config');

class Room {
  constructor(roomId, worker) {
    this.id = roomId;
    this.worker = worker;
    this.router = null;
    this.peers = new Map();
  }

  async init() {
    this.router = await this.worker.createRouter({
      mediaCodecs: config.mediasoup.router.mediaCodecs,
    });
  }

  addPeer(peerId, socket) {
    const peer = {
      id: peerId,
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    };

    this.peers.set(peerId, peer);
    return peer;
  }

  removePeer(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    // Close all transports
    peer.transports.forEach(transport => transport.close());
    
    // Close all producers
    peer.producers.forEach(producer => producer.close());

    // Close all consumers
    peer.consumers.forEach(consumer => consumer.close());

    this.peers.delete(peerId);
  }

  async createWebRtcTransport(peerId) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    const transport = await this.router.createWebRtcTransport({
      ...config.mediasoup.webRtcTransport,
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    peer.transports.set(transport.id, transport);
    
    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
  }

  async connectTransport(peerId, transportId, dtlsParameters) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    await transport.connect({ dtlsParameters });
  }

  async produce(peerId, transportId, rtpParameters, kind) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    const transport = peer.transports.get(transportId);
    if (!transport) throw new Error('Transport not found');

    const producer = await transport.produce({ kind, rtpParameters });
    
    producer.on('transportclose', () => {
      producer.close();
    });

    peer.producers.set(producer.id, producer);

    // Inform other peers about new producer
    this.broadcastToPeers(peerId, 'newProducer', {
      peerId,
      producerId: producer.id,
      kind: producer.kind,
    });

    return producer.id;
  }

  async consume(peerId, producerId, rtpCapabilities) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    if (!this.router.canConsume({ producerId, rtpCapabilities })) {
      throw new Error('Cannot consume');
    }

    // Get send transport (assume it exists)
    const sendTransport = Array.from(peer.transports.values()).find(t => t.appData?.direction === 'send');
    if (!sendTransport) throw new Error('Send transport not found');

    const consumer = await sendTransport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    consumer.on('transportclose', () => {
      consumer.close();
    });

    consumer.on('producerclose', () => {
      consumer.close();
      peer.socket.emit('consumerClosed', { consumerId: consumer.id });
    });

    peer.consumers.set(consumer.id, consumer);

    return {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    };
  }

  async resumeConsumer(peerId, consumerId) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('Peer not found');

    const consumer = peer.consumers.get(consumerId);
    if (!consumer) throw new Error('Consumer not found');

    await consumer.resume();
  }

  broadcastToPeers(excludePeerId, event, data) {
    this.peers.forEach((peer, peerId) => {
      if (peerId !== excludePeerId) {
        peer.socket.emit(event, data);
      }
    });
  }

  getProducers() {
    const producers = [];
    this.peers.forEach((peer, peerId) => {
      peer.producers.forEach((producer, producerId) => {
        producers.push({
          peerId,
          producerId,
          kind: producer.kind,
        });
      });
    });
    return producers;
  }
}

module.exports = Room;