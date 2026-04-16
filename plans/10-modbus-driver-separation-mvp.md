# Modbus Driver Separation MVP

## 목표
mock-sensor(A)와 파싱 책임을 분리한다.

- mock-sensor: raw 생성/전송만 담당
- modbus-driver: Modbus RTU 파싱 + collector 전달 담당
- backend-core: 수집/저장/스트림 담당

---

## 분리 후 책임

1) mock-sensor
- `SENSOR_OUTPUT_MODE=raw`일 때 raw frame 생성
- `GET /raw/frame`으로 드라이버가 pull
- 통신 on/off, loop start/stop 제어 유지

2) modbus-driver (신규)
- `RAW_FRAME_URL`에서 raw frame 수신
- Modbus RTU CRC 검증
- 레지스터 파싱(temperature/humidity/power)
- collector(`/collect`)로 정규화 이벤트 전달

3) backend-core
- 기존 `/collect` ingest 유지
- 파싱 결과를 이벤트로 저장/전달

---

## 테스트 시나리오

1. mock-sensor raw 모드 기동
2. modbus-driver 기동
3. backend-core `/events`에서 source=`modbus-driver` 이벤트 유입 확인
4. comm/off -> driver 수집 실패 -> 상태 DISCONNECTED 확인
5. comm/on + loop/start -> recover 확인

---

## 수용기준 (AC)

- [ ] modbus-driver가 raw frame CRC 검증 수행
- [ ] register 3개를 temperature/humidity/power로 파싱
- [ ] collector에 정규화 이벤트 2xx 전송
- [ ] 장애 시 driver 상태가 DISCONNECTED로 전이
