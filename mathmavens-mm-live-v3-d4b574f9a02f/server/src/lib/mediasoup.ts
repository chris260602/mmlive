const mediasoup = require('mediasoup');
const config = require('../config');

class MediasoupManager {
  constructor() {
    this.workers = [];
    this.nextWorkerIdx = 0;
  }

  async init() {
    const { worker } = config.mediasoup;
    
    // Create workers (typically one per CPU core)
    const numWorkers = require('os').cpus().length;
    
    for (let i = 0; i < numWorkers; i++) {
      const worker = await mediasoup.createWorker({
        logLevel: worker.logLevel,
        logTags: worker.logTags,
        rtcMinPort: worker.rtcMinPort,
        rtcMaxPort: worker.rtcMaxPort,
      });

      worker.on('died', (error) => {
        console.error('Mediasoup worker died:', error);
        setTimeout(() => process.exit(1), 2000);
      });

      this.workers.push(worker);
    }

    console.log(`Created ${this.workers.length} mediasoup workers`);
  }

  getWorker() {
    const worker = this.workers[this.nextWorkerIdx];
    this.nextWorkerIdx = (this.nextWorkerIdx + 1) % this.workers.length;
    return worker;
  }
}

module.exports = new MediasoupManager();