export class SensorAdapter {
  constructor(kind = "unknown") {
    this.kind = kind;
    this.started = false;
  }

  async start(_config = {}) {
    this.started = true;
  }

  async stop() {
    this.started = false;
  }

  // should return normalized event candidates
  // [{ type, value, unit, timestamp, meta? }, ...]
  async read() {
    return [];
  }

  health() {
    return {
      kind: this.kind,
      started: this.started,
      at: new Date().toISOString(),
    };
  }
}
