# mock-sensor (A)

가짜 센서 데이터(또는 raw frame) 생성기.

## 역할
- `SENSOR_OUTPUT_MODE=collector`: 기존처럼 collector(`/collect`)에 정규화 이벤트 전송
- `SENSOR_OUTPUT_MODE=raw`: Modbus RTU raw frame 생성 (`GET /raw/frame`)

## 실행
```bash
npm install
npm run dev --workspace services/mock-sensor
```

## 엔드포인트
- `GET /health`
- `GET /status`
- `GET /raw/frame` (raw 모드에서 드라이버가 호출)
- `POST /comm/on`, `POST /comm/off`
- `POST /loop/start`, `POST /loop/stop`
- `POST /control`
- `POST /emit-once`
