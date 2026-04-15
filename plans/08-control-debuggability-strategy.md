# CUTE 제어 디버깅 용이성 강화 전략

목표: web -> backend-core -> mock-sensor 제어 경로에서 오류가 발생했을 때, **원인 분석 시간(MTTR)을 줄이고 재현성을 높이는 것**.

---

## 1) 현재 문제 요약

웹앱에서 센서를 제어할 때 디버깅이 어려운 이유:
1. 다단계 경로 (Web -> Core -> Sensor)라 실패 지점 식별이 느림
2. 에러 코드/메시지는 있으나 hop-by-hop 맥락이 부족함
3. 배포 환경 변수 미스매치(엔드포인트 경로/도메인)가 자주 원인
4. 실시간 UI 상태와 제어 성공 여부가 타이밍 이슈로 어긋날 수 있음

---

## 2) 원인 분석을 쉽게 만드는 핵심 원칙

1. **단일 제어 시도 ID(controlTraceId)**를 전체 홉에 전파
2. 응답/로그에 **시도한 URL + fallback URL + hop 결과**를 구조화
3. 에러 코드는 유지하되, 기술 상세는 별도 `debug` 객체로 분리
4. UI에서 즉시 복사 가능한 “디버그 패킷” 제공
5. 제어 이벤트를 timeline으로 남겨 **성공/실패/복구 흐름**을 볼 수 있게 함

---

## 3) 제안 아키텍처 (Control Attempt Envelope)

제어 요청마다 아래 형태를 공통 사용:

```json
{
  "controlTraceId": "ctl_...",
  "action": "comm_off",
  "target": "mock-1",
  "requestedAt": "...",
  "hopResults": [
    {
      "hop": "web->core",
      "ok": true,
      "status": 200,
      "latencyMs": 43
    },
    {
      "hop": "core->sensor(primary)",
      "ok": false,
      "status": 503,
      "url": "https://.../comm/off",
      "errorCode": 4002
    },
    {
      "hop": "core->sensor(fallback)",
      "ok": true,
      "status": 200,
      "url": "https://.../control"
    }
  ],
  "result": "accepted"
}
```

핵심: 성공/실패 여부뿐 아니라 “어디서 실패했고 어디서 복구됐는지”를 기계적으로 확인 가능.

---

## 4) 즉시 적용 가능한 개선 (Short-term)

### A. 로그 구조화 (JSON line)
- backend-core / mock-sensor 모두 JSON 로그
- 필드 고정:
  - `timestamp`, `level`, `service`, `controlTraceId`, `action`, `target`, `errorCode`, `url`, `status`, `latencyMs`

### B. 제어 응답 확장
- 현재 응답에 아래 추가:
  - `controlTraceId`
  - `path` (primary/fallback)
  - `targetUrl`, `fallbackUrl`
  - `hopResults` 요약

### C. 웹 UI 디버그 패널(토글)
- `?debugControl=1`에서만 노출
- 최근 제어 20건 table/card:
  - action / traceId / status / primary/fallback / errorCode / latency
- “복사” 버튼으로 issue 템플릿 자동 생성

### D. 헬스 + 사전점검 버튼
- 팝업에 “사전점검(Preflight)” 버튼 추가
- 체크:
  1) core `/health`
  2) core `/sensor/status`
  3) control endpoint reachable 여부
- 실패 시 사람이 이해 가능한 가이드 출력

---

## 5) 중기 개선 (Mid-term)

### A. 명령 이력 저장소 (in-memory ring buffer)
- backend-core에 `controlAttempts` ring buffer(예: 1000건)
- API:
  - `GET /control/attempts?limit=50`
  - `GET /control/attempts/:traceId`

### B. SSE 이벤트 추가
- `control.attempt` (시도)
- `control.result` (완료)
- UI 로그 탭에서 실시간 추적 가능

### C. 에러 코드 세분화
- 4002(comm), 4003(loop) 내부 원인을 서브코드로 분리
  - 예: 40021 DNS, 40022 timeout, 40023 503, 40024 invalid response

---

## 6) 운영 관점 Runbook 강화

오류 발생 시 운영 절차 표준화:
1. errorCode 확인
2. targetUrl/fallbackUrl 확인
3. controlTraceId로 core/sensor 로그 검색
4. hopResults에서 첫 실패 hop 확인
5. 해당 hop runbook 수행

문서 연결:
- `plans/03-deployment-runbook.md`
- `plans/05-error-code-system.md`

---

## 7) 웹 제어 디버깅이 어려운 문제를 극복하는 실전 방법

1. **제어 자체를 관측 가능한 도메인 이벤트로 취급** (단순 버튼 클릭이 아님)
2. **primary/fallback 경로를 UI에 숨기지 않음**
3. **동기 응답 + 비동기 SSE ack**를 함께 보여 race-condition 체감 감소
4. **재현 가능한 리플레이 payload** 제공 (copy as curl/json)
5. **성공보다 실패를 먼저 설계** (timeout, 503, partial success)

---

## 8) 권장 구현 우선순위

1. controlTraceId + hopResults 응답 확장
2. backend/mock structured logging
3. web debug panel(`debugControl`)
4. control attempt history API + 로그 화면 연동
5. runbook/에러코드 서브코드 정교화

---

## 9) 수용 기준 (AC)

- [ ] 503 발생 시 어떤 hop에서 실패했는지 10초 내 식별 가능
- [ ] 동일 이슈 재현을 위한 payload/trace를 UI에서 바로 복사 가능
- [ ] fallback 사용 여부를 사용자/개발자가 모두 확인 가능
- [ ] 1건의 제어 시도에 대해 web/core/sensor 로그 연계 검색 가능
