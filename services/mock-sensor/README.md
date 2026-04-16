# mock-sensor (A)

가짜 센서 데이터(또는 raw frame) 생성기.

## 역할
- `SENSOR_OUTPUT_MODE=collector`: (호환 모드) collector(`/collect`)에 정규화 이벤트 전송
- `SENSOR_OUTPUT_MODE=raw`: Modbus RTU raw frame 생성 (`GET /raw/frame`)

기본은 `ENFORCE_DRIVER_PIPELINE=true`로, collector 직송을 차단하고 `raw -> modbus-driver -> /collect` 경로만 허용합니다.

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
