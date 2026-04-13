# CUTE Railway 배포 Quickstart

이 문서는 **단일 GitHub 리포(CUTE)** 기준으로 Railway 서비스 3개를 배포하는 절차입니다.

- backend-core: `services/realtime-db` (B+C+D+E)
- mock-sensor: `services/mock-sensor` (A)
- mobile-web: `apps/mobile-web` (F)

---

## 1) GitHub 리포 전략

권장: **리포 1개 (`CUTE`) 유지**

이유:
- A~F가 서로 강하게 연동되는 MVP 단계
- 변경사항 동기화가 쉬움
- 포트폴리오에 "모노레포 운영" 경험 어필 가능

분리 리포가 필요한 시점:
- 팀이 서비스별로 완전히 분리되어 작업할 때
- 배포 주기가 서비스마다 크게 다를 때
- 권한/보안 경계를 서비스별로 강하게 나눌 때

MVP 현재 단계에서는 **분리 불필요**.

---

## 2) Railway 서비스 생성

Railway 프로젝트에서 서비스 3개 생성 후 모두 같은 GitHub 리포 `CUTE` 연결.

### Service A: backend-core
- Root Directory: `services/realtime-db`
- Start Command: `npm run start` (railway.json 있음)

Variables:
- `PORT=3000`
- `NODE_ENV=production`
- `EVENT_BUFFER_SIZE=5000`
- `SSE_HEARTBEAT_MS=15000`
- `CORS_ORIGINS=https://<mobile-web-public-domain>`

### Service B: mock-sensor
- Root Directory: `services/mock-sensor`
- Start Command: `npm run start`

Variables:
- `PORT=3100`
- `NODE_ENV=production`
- `COLLECTOR_URL=http://<backend-service-name>.railway.internal:3000/collect`
- `SENSOR_ID=mock-1`
- `SENSOR_INTERVAL_MS=1000`

### Service C: mobile-web
- Root Directory: `apps/mobile-web`
- Start Command: `npm run start`

Variables:
- `PORT=3200`
- `NODE_ENV=production`
- `API_BASE_URL=https://<backend-public-domain>`

---

## 3) 배포 순서 (중요)

1. backend-core 먼저 배포
2. mobile-web 배포 (API_BASE_URL 연결)
3. mock-sensor 배포 (COLLECTOR_URL 내부 도메인 연결)
4. 검증

---

## 4) 검증 체크

- backend: `GET /health` -> ok
- backend: `GET /events?limit=5` -> items 증가
- web 접속 -> 상태 badge가 `connected`
- 웹 카드 값이 1~2초마다 갱신

---

## 5) 자주 나는 문제

1. CORS 에러
- backend `CORS_ORIGINS`에 web 도메인 추가

2. mock-sensor 전송 실패
- `COLLECTOR_URL` 오타/서비스명 확인
- 내부 도메인 포트 확인

3. web는 뜨는데 값이 안 바뀜
- backend `/stream` 연결 확인
- mock-sensor 로그에서 collect 2xx 확인

---

## 6) 다음 단계

- D 저장소를 메모리 -> Redis/Postgres 교체
- E를 SSE -> WebSocket 업그레이드
- 제어 경로 `/control`에 실제 adapter 연결
