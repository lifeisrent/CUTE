# CUTE Railway 서비스/환경변수 계획 (Plan 2)

목표: MVP를 Railway에서 안정적으로 배포할 수 있도록 서비스 분리/변수/네트워크를 사전 정의.

---

## 1. Railway 서비스 구성 (초안)

최소 3서비스 권장:
1. `cute-backend-core` (B + C + D + E)
2. `cute-mock-sensor` (A)
3. `cute-web` (F)

이유:
- 서비스 개수 과다를 피하면서 책임 분리 유지
- 초기 운영 복잡도 감소

---

## 2. 내부 통신 경로

- mock-sensor(A) -> backend-core(B)
  - `COLLECTOR_URL=http://cute-backend-core.railway.internal:3000/collect`
- web(F) -> backend-core(E)
  - 공개 URL 기준
  - `VITE_API_BASE_URL=https://<backend-public-domain>`

---

## 3. 서비스별 환경변수

### backend-core
- `PORT=3000`
- `NODE_ENV=production`
- `EVENT_BUFFER_SIZE=5000`
- `SSE_HEARTBEAT_MS=15000`
- `CORS_ORIGINS=https://<web-domain>`

### mock-sensor
- `PORT=3100`
- `NODE_ENV=production`
- `COLLECTOR_URL=http://cute-backend-core.railway.internal:3000/collect`
- `SENSOR_INTERVAL_MS=1000`
- `SENSOR_ID=mock-1`

### web
- `NODE_ENV=production`
- `VITE_API_BASE_URL=https://<backend-public-domain>`

---

## 4. 배포 순서

1) backend-core 배포
2) web 배포 (API base URL 연결)
3) mock-sensor 배포 (collector internal URL 연결)
4) end-to-end 검증

---

## 5. 관측/로그 규칙

- 모든 서비스 로그에 `traceId`, `eventId`, `service` 포함
- backend-core에서 수신/저장/스트림 전송 단계별 로그
- 에러 로그는 JSON 형태로 통일

---

## 6. 장애 대응

### 증상: 웹에 데이터 안 뜸
- backend-core `/health` 확인
- SSE 연결 상태 확인
- mock-sensor 로그에서 collector 호출 성공 여부 확인

### 증상: 데이터 지연
- `SENSOR_INTERVAL_MS` 과도값 점검
- buffer overflow 여부 점검
- Railway 리소스(메모리/CPU) 점검

---

## 7. 추후 확장

- backend-core를 B/C/D/E로 완전 분리
- D 저장소 Redis/Postgres 교체
- SSE -> WebSocket 전환 옵션 추가
