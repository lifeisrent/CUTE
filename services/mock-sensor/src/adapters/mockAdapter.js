import { SensorAdapter } from "./base.js";

function rand(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

export class MockAdapter extends SensorAdapter {
  constructor() {
    super("mock");
    this.controlState = {
      fanOn: false,
      lastAction: "init",
      updatedAt: new Date().toISOString(),
    };
  }

  setAction(action = "noop") {
    const a = String(action).toLowerCase();
    if (a === "fan_on") this.controlState.fanOn = true;
    if (a === "fan_off") this.controlState.fanOn = false;
    this.controlState.lastAction = a;
    this.controlState.updatedAt = new Date().toISOString();
  }

  getControlState() {
    return { ...this.controlState };
  }

  async read() {
    const now = new Date().toISOString();
    const fanOn = this.controlState.fanOn;

    const temperature = fanOn ? rand(18.5, 24.5) : rand(23.5, 29.5);
    const humidity = fanOn ? rand(35, 55) : rand(40, 65);
    const power = fanOn ? rand(260, 460) : rand(90, 220);

    return [
      { type: "temperature", value: temperature, unit: "C", timestamp: now, meta: { protocol: "mock" } },
      { type: "humidity", value: humidity, unit: "%", timestamp: now, meta: { protocol: "mock" } },
      { type: "power", value: power, unit: "W", timestamp: now, meta: { protocol: "mock" } },
    ];
  }
}
