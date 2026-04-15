# Sensor Lifecycle & Recovery Scenarios

## 목적
Mock 센서(A)와 backend-core(B/C/D/E) 사이에서 발생하는 연결/중단/복구를 운영 가능한 시나리오로 정의한다.

---

## 1) 센서 생명주기 관리

상태 정의:
- `INIT` : 서비스 시작, 아직 collector 연결 확인 전
- `CONNECTED` : collector 전송 성공 상태
- `DISCONNECTED` : 전송 실패 누적 상태
- `PAUSED` : 루프 stop 상태 (수동)
- `STOPPED` : 서비스 종료

전이 규칙(초안):
- INIT -> CONNECTED: health check/first send 성공
- CONNECTED -> DISCONNECTED: N회 연속 전송 실패
- DISCONNECTED -> CONNECTED: 재시도 성공
- CONNECTED -> PAUSED: 루프 stop 명령
- PAUSED -> CONNECTED: 루프 start 명령 + 전송 성공
- * -> STOPPED: 프로세스 종료

---

## 2) Mock 센서 통신연결 ON/OFF

요구 API:
- `POST /comm/on`
- `POST /comm/off`
- `GET /status`

동작:
- OFF: collector 전송 시도 자체를 차단 (의도적 단절 테스트)
- ON: 전송 재개

상태 필드 예시:
```json
{
  "commEnabled": true,
  "loopRunning": true,
  "state": "CONNECTED",
  "lastSendAt": "...",
  "consecutiveFailures": 0
}
```

---

## 3) Mock 센서 데이터 루프 START/STOP

요구 API:
- `POST /loop/start`
- `POST /loop/stop`

동작:
- stop: 주기 발행 중단 (상태는 PAUSED)
- start: 주기 발행 재개

UI 기대:
- 대시보드 제어 카드에서 loop start/stop 테스트 버튼 제공 (후속)

---

## 4) Mock 센서 서비스 다운 시 시나리오

상황:
- mock-sensor 프로세스 종료 또는 크래시

기대 동작:
1. backend는 최근 데이터 유지(메모리)
2. 신규 sensor.update 중단
3. web UI 연결은 유지되되, 데이터 정체 감지 배지 노출(후속)
4. error code 발생
   - 예: `5001` (mock-sensor -> collector 전송 실패)

운영 대응:
- Railway에서 mock-sensor 서비스 재시작
- `/health` 정상 확인

---

## 5) 서비스 재연결 시 시나리오

상황:
- mock-sensor 재시작 후 collector 재전송 시작

기대 동작:
1. sensor.update 이벤트 재유입
2. web 카드 값 갱신 재개
3. 상태 배지 `reconnecting -> connected` 전환
4. 필요시 recovery 이벤트 1회 발행(후속)

검증 체크리스트:
- [ ] 재시작 10초 내 stream 재유입
- [ ] command ack 정상 수신 유지
- [ ] 이전 에러 메시지 클리어

---

## 6) 다음 구현 우선순위

1. mock-sensor 상태머신 + `/status`
2. `/comm/on|off`, `/loop/start|stop` API
3. 실패 카운터/재시도 backoff
4. web 상태 배지 확장 (stale/disconnected/recovered)
