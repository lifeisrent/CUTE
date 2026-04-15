import { SensorAdapter } from "./base.js";

// Stub adapter for future serial integration
export class SerialStubAdapter extends SensorAdapter {
  constructor() {
    super("serial");
  }

  async read() {
    // future: parse serial frames -> normalize
    return [];
  }
}
