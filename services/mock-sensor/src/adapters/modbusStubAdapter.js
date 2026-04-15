import { SensorAdapter } from "./base.js";

// Stub adapter for future modbus integration
export class ModbusStubAdapter extends SensorAdapter {
  constructor() {
    super("modbus");
  }

  async read() {
    // future: read registers -> normalize
    return [];
  }
}
