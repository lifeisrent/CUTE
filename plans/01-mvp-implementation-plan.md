# CUTE MVP 구현 계획 (Plan 1)

목표: Railway 기준으로 CUTE의 핵심 흐름(A→B→C+D→E→F)을 빠르게 동작시키는 것.

---

## 1. MVP 범위 재확인

포함:
- A mock-sensor: 가짜 센서 이벤트 주기 발행
- B collector: 이벤트 수집 진입점 + 검증 + trace 부여
- C+D ingest+realtime-db: 이벤트 저장(in-memory) + 조회
- E stream-gateway: SSE 스트림 제공
- F mobile-web: 실시간 대시보드

제외(후속):
- 실제 하드웨어 프로토콜(MQTT/Modbus/OPC-UA)
- 영구 저장 DB (Redis/Postgres)
- 권한/인증 시스템

---

## 2. 서비스별 구현 항목

### A. mock-sensor
- 센서 타입: temperature/humidity/power
- 주기: 1~2초
- 출력: Event Envelope JSON
- 전송 대상: B `/collect`

완료 조건:
- 3종 데이터가 주기적으로 B에 전송됨
- 네트워크 실패 시 retry(backoff) 동작

### B. collector
- `POST /collect`
- 필수 필드 검증
- traceId/eventId 보정
- C `/ingest`로 전달

완료 조건:
- 유효 payload만 전달
- 잘못된 payload는 400 반환
- 전달 성공/실패 로그 분리

### C+D. ingest+realtime-db
- `POST /ingest` 수신
- ring buffer 저장(예: 최근 5,000건)
- `GET /events?limit=50` 제공
- 최신 값 캐시(`latestBySensor`) 제공

완료 조건:
- 이벤트 누적 저장
- 최근 이벤트 조회 가능
- 메모리 상한 유지

### E. stream-gateway
- `GET /stream` SSE
- heartbeat 전송(예: 15초)
- 새 이벤트를 클라이언트에 push

완료 조건:
- 브라우저 EventSource 연결 유지
- 이벤트 실시간 수신

### F. mobile-web
- 연결 상태 배지(connected/reconnecting)
- 센서별 현재값 카드
- 최근 이벤트 리스트
- 오류 상태 표시

완료 조건:
- SSE 연결 시 실시간 UI 반영
- 끊김 후 재연결 확인

---

## 3. 공통 계약 (Event Envelope)

```json
{
  "eventId": "evt_xxx",
  "traceId": "tr_xxx",
  "source": "A",
  "sensorId": "mock-1",
  "type": "temperature",
  "value": 23.4,
  "unit": "C",
  "timestamp": "2026-04-13T01:00:00.000Z"
}
```

규칙:
- `eventId`, `traceId` 없으면 B에서 생성
- `timestamp`는 ISO8601 UTC
- `type` 허용값 고정

---

## 4. 구현 순서 (실행 순)

1) C+D 먼저 구현 (저장/조회 API)
2) E SSE 구현 (C+D 데이터를 publish)
3) B collector 구현 (C+D 연결)
4) A mock-sensor 구현 (B 연결)
5) F 프론트 구현 (E 연결)
6) end-to-end 테스트

---

## 5. QA 체크리스트

- [ ] A->B->C+D->E->F 전체 이벤트 흐름 확인
- [ ] 10분 연속 구동 시 메모리 안정성
- [ ] SSE 재연결 동작 확인
- [ ] malformed payload 처리(400)
- [ ] 이벤트 지연 시간 측정(평균/최댓값)

---

## 6. 산출물
- 각 서비스 README + `.env.example`
- root 실행 가이드
- API 예제(curl)
- Railway 배포 가이드 링크
