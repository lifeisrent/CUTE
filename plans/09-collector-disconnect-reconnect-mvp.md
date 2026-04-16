# Collector Disconnect/Reconnect MVP Plan

## 배경
현재는 UI/차트 중심 구현이 빠르게 진행되었고, 실제 운영에서 더 중요한 시나리오는 다음이다.

- `backend-core` ↔ `mock-sensor(collector 역할)` 연결이 끊겼다가 복구되는 상황
- 시리얼/장비 특성상 패킷이 안 오면 단절/복구를 즉시 알기 어려운 상황
- sensor/드라이버/생명주기/수집 서버 책임이 뭉쳐 있는 구조를 분리 가능한 형태로 전환

본 문서는 **기존 `apps/mobile-web` 기준**으로 위 시나리오를 테스트할 수 있는 버튼/동작/구현 순서를 정의한다.

---

## 목표 (MVP)

1. backend-core가 "데이터 수집 서버(mock-sensor) 단절/복구"를 상태로 인식한다.
2. 단절/복구를 사람 손으로 재현할 수 있는 테스트 버튼을 웹에서 제공한다.
3. 상태 전이와 원인을 로그/이벤트로 확인 가능하게 만든다.
4. 향후 실장비(시리얼 드라이버) 연동 시에도 같은 lifecycle 인터페이스를 재사용한다.

---

## 1) 책임 분리 아키텍처 (뼈대)

### A. Data Collector (현재 mock-sensor)
- 책임:
  - 장비/드라이버에서 읽기
  - backend-core로 전송(`POST /collect`)
  - collector 내부 생명주기 관리
- 상태:
  - `INIT`, `CONNECTED`, `DISCONNECTED`, `PAUSED`, `STOPPED`

### B. Backend Core (현재 services/realtime-db)
- 책임:
  - 수집 데이터 ingest
  - collector liveness 추적
  - 상태 API/SSE 이벤트 제공
  - 제어 릴레이(comm/loop + 향후 collector control)

### C. Driver Adapter (추후 serial/modbus)
- 책임:
  - 장비별 read/write 구현
  - collector 공통 인터페이스 준수

### D. Lifecycle Monitor (core 내부 모듈)
- 책임:
  - 마지막 수신 시각 추적
  - stale 임계치 기반 상태 전이
  - 복구 감지 및 recovery 이벤트 생성

---

## 2) 상태 모델 (Core 관점)

collector 상태:
- `UNKNOWN` : 아직 collector heartbeat/data 미수신
- `HEALTHY` : 최근 수신 정상
- `STALE` : 일정 시간 데이터 없음(패킷 무전송)
- `DISCONNECTED` : health/collect 실패 또는 timeout 누적
- `RECOVERING` : 다시 신호 감지되었으나 안정화 대기

전이 예시:
- UNKNOWN -> HEALTHY : collect 수신/health ok
- HEALTHY -> STALE : `now - lastCollectAt > staleMs`
- STALE -> DISCONNECTED : health check 연속 실패 N회
- DISCONNECTED -> RECOVERING : collect 재수신 또는 health ok
- RECOVERING -> HEALTHY : 안정화 시간 내 연속 성공

---

## 3) 테스트 시나리오용 버튼/동작 정의 (apps/mobile-web)

### A. "Collector 연결 테스트" 카드 추가
로그 메뉴 또는 제어 카드 하단에 다음 버튼 추가:

1. `Collector Ping`
   - core -> sensor `/health` 체크
   - 결과: `ok/fail + latency + targetUrl`

2. `Collector Simulate Disconnect`
   - mock-sensor `comm/off` 호출
   - 기대: core 상태 `HEALTHY -> STALE -> DISCONNECTED`

3. `Collector Simulate Reconnect`
   - mock-sensor `comm/on` + `loop/start`
   - 기대: core 상태 `DISCONNECTED -> RECOVERING -> HEALTHY`

4. `Force Core Recheck`
   - core가 즉시 health probe 실행
   - 수동 검증용

### B. 상태 표시
- 배지: `UNKNOWN/HEALTHY/STALE/DISCONNECTED/RECOVERING`
- 부가 텍스트:
  - `lastCollectAt`
  - `lastProbeAt`
  - `consecutiveProbeFailures`
  - `lastRecoveryAt`

---

## 4) API 계약 (MVP 추가)

### backend-core
- `GET /collector/status`
  - 현재 collector 상태 + 관측 메타
- `POST /collector/probe`
  - 즉시 health probe 실행
- `POST /collector/simulate-disconnect`
  - 내부적으로 sensor comm/off 호출 (테스트용)
- `POST /collector/simulate-reconnect`
  - sensor comm/on + loop/start 호출 (테스트용)

응답 공통 필드:
```json
{
  "ok": true,
  "collectorState": "HEALTHY",
  "traceId": "col_...",
  "targetUrl": "...",
  "latencyMs": 42,
  "errorCode": null
}
```

### SSE 이벤트 (core -> web)
- `collector.state`
- `collector.probe`
- `collector.recovery`

---

## 5) 에러코드 제안 (신규)

- `4101` collector probe 실패
- `4102` collector stale 임계 초과
- `4103` collector reconnect 실패
- `4104` collector recovering timeout

(기존 4002/4003 comm/loop 제어 코드와 분리)

---

## 6) 구현 순서 (작게 쪼개기)

### Step 1: core 관측 뼈대
- `collectorMonitor` in-memory 상태 추가
- `/collector/status` 구현
- collect 수신 시 `lastCollectAt` 갱신

### Step 2: probe + 수동 트리거
- `/collector/probe` 구현
- 상태 전이 로직 (`HEALTHY/STALE/DISCONNECTED`) 적용

### Step 3: simulate 버튼 백엔드
- `/collector/simulate-disconnect`
- `/collector/simulate-reconnect`
- 내부적으로 기존 `/sensor/comm`, `/sensor/loop` 재사용

### Step 4: 모바일 웹 UI
- 로그 탭에 Collector Test 카드 추가
- 4개 버튼 + 상태배지 + 디버그 출력

### Step 5: 복구 이벤트/로그
- `collector.state` SSE 발행
- traceId 기반 JSON 로그 출력

---

## 7) 수용 기준 (AC)

- [ ] UI 버튼으로 disconnect/reconnect 재현 가능
- [ ] core에서 상태 전이(HEALTHY->STALE->DISCONNECTED->RECOVERING->HEALTHY) 확인 가능
- [ ] 각 전이에 traceId, timestamp, 원인 기록
- [ ] reconnect 후 10초 이내 데이터 재유입 확인 가능
- [ ] 실패 시 에러코드(410x)로 원인 분류 가능

---

## 8) 운영 메모

- 실제 시리얼 장비 환경에서는 passive 수신만으로는 복구 인지 지연이 큼
- 따라서 최소 heartbeat/probe를 core 또는 collector에 넣어야 함
- 본 MVP는 mock-sensor 기반으로 그 구조를 먼저 검증하는 단계
