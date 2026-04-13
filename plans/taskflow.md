# CUTE Taskflow (MVP)

## 0) 아키텍처 재정의 (A~F)
요청한 서비스 분해를 기준으로, MVP에서는 **역할 명확화 + 인터페이스 고정**을 우선한다.

- **A: mock-sensor**
  - 가짜 센서 이벤트 생성
  - B로 전송
- **B: collector**
  - 센서 이벤트 수집 진입점
  - 유효성 검사 후 C로 전달
- **C: ingest-router**
  - B에서 받은 이벤트를 D(실시간 DB)에 적재
  - 필요시 E에 브로드캐스트 트리거
- **D: realtime-db**
  - 이벤트 저장소(초기: in-memory)
  - 조회 API 제공
- **E: stream-gateway**
  - D 조회 또는 C 푸시를 받아 클라이언트 전달
  - SSE/WebSocket 제공
- **F: mobile-web client**
  - E 스트림 구독 + 대시보드 렌더
  - 제어 명령 전송(초기: B 또는 별도 control endpoint)

---

## 1) 복잡도 완화 전략 (중요)
서비스가 많으므로 MVP에선 아래 원칙 적용:

1. **코드 분리는 하되, 런타임 결합은 최소화**
   - 초기엔 C와 D를 같은 프로세스로 묶는 옵션 허용
2. **인터페이스부터 고정**
   - 서비스 간 계약(JSON schema, endpoint) 먼저 고정
3. **관측성 우선**
   - requestId, traceId, source(A/B/C...)를 모든 이벤트에 포함
4. **단계적 분리**
   - 처음부터 6개 완전분리보다, 3개 묶음으로 시작 후 분리

---

## 2) MVP 배포 단위 제안
### Stage 1 (실행 가능 최소단위)
- A mock-sensor
- B collector
- C+D ingest+db (임시 결합)
- E stream-gateway
- F mobile-web

### Stage 2 (진짜 분리)
- C와 D 프로세스 분리
- C->D 비동기 큐 도입(옵션)

---

## 3) 서비스 간 계약(초안)

### Event Envelope (공통)
```json
{
  "eventId": "evt_123",
  "traceId": "tr_abc",
  "source": "A",
  "sensorId": "mock-1",
  "type": "temperature",
  "value": 23.4,
  "unit": "C",
  "timestamp": "2026-04-13T01:00:00.000Z"
}
```

### A -> B
- `POST /collect`
- body: Event Envelope

### B -> C
- `POST /ingest`
- body: validated Event Envelope

### C -> D
- 내부 API 또는 direct module call (Stage1)
- 분리 후 `POST /events`

### D -> E
- `GET /events?limit=50`
- (옵션) `GET /events/stream`

### E -> F
- `GET /stream` (SSE) 또는 `/ws`

---

## 4) 단계별 구현 계획

## Phase 0. 부트스트랩
- [x] 모노레포 기본 구조 생성
- [ ] 서비스별 환경변수 템플릿 작성
- [ ] 로컬 통합 실행 방식 정의

## Phase 1. A(mock-sensor)
- [ ] 이벤트 생성 주기/패턴 정의
- [ ] `POST /collect` 호출 루프 구현
- [ ] 장애 시 재시도/backoff

## Phase 2. B(collector)
- [ ] `/collect` 엔드포인트 구현
- [ ] payload 스키마 검증
- [ ] traceId 주입 + C 전달

## Phase 3. C+D(ingest+realtime-db)
- [ ] `/ingest` 수신
- [ ] 저장소(in-memory ring buffer)
- [ ] `/events` 조회

## Phase 4. E(stream-gateway)
- [ ] SSE `/stream` 구현
- [ ] D polling or push relay
- [ ] 연결 상태/heartbeat 관리

## Phase 5. F(mobile-web)
- [ ] 실시간 대시보드 카드
- [ ] 최신 이벤트 리스트
- [ ] 연결 상태 표시

## Phase 6. 통합/검증
- [ ] A->B->C->D->E->F end-to-end
- [ ] 지연/누락/중복 체크
- [ ] 장애 시 복구 플로우 검증

---

## 5) 지금 당장 결정할 것 (결정 완료)
1. Stage1에서 C와 D를 묶을지
   - 결정: **묶기 (OK)**
2. E는 SSE로 시작할지 WebSocket으로 시작할지
   - 결정: **SSE로 MVP 시작**
3. 데이터 저장을 메모리로 시작할지 Redis를 바로 쓸지
   - 결정: **메모리 저장으로 시작**

### 5-1) 결정 반영 지침
- 스트리밍 채널은 `SSE`를 기본으로 구현 (`GET /stream`)
- 저장소는 `in-memory ring buffer`로 구현
- 추후 교체 지점 명확화:
  - SSE -> WebSocket 교체는 E(stream-gateway) 한정
  - 메모리 -> Redis/Postgres 교체는 D(realtime-db) 한정
