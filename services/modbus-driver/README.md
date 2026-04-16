# modbus-driver

Modbus RTU raw frame 파싱 전용 드라이버 프로세스.

## 책임
- raw frame 수신 (`RAW_FRAME_URL`)
- Modbus RTU CRC 검증/레지스터 파싱
- 파싱된 이벤트를 collector(`/collect`)로 전달

## 실행
```bash
npm install
npm run dev --workspace services/modbus-driver
```

## 환경변수
- `PORT` (default: 3110)
- `COLLECTOR_URL` (default: http://localhost:3000/collect)
- `RAW_FRAME_URL` (default: http://localhost:3100/raw/frame)
- `SENSOR_ID` (default: modbus-1)
- `DRIVER_INTERVAL_MS` (default: 1000)
- `MODBUS_SLAVE_ID` (default: 1)

## 엔드포인트
- `GET /health`
- `GET /status`
- `POST /driver/start`
- `POST /driver/stop`
- `POST /emit-once`
