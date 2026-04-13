# CUTE 배포/운영 런북 (Plan 3)

목표: Railway 기준으로 "배포 -> 검증 -> 장애대응"을 반복 가능한 절차로 문서화.

---

## 1. 배포 전 체크

- [ ] 각 서비스 `.env.example` 최신화
- [ ] health endpoint 준비 (`/health`)
- [ ] CORS 설정 확인
- [ ] 로컬 통합 테스트 성공

---

## 2. Railway 배포 절차

1. 리포 연결 (GitHub)
2. 서비스 생성 (backend-core, mock-sensor, web)
3. Start Command 설정
4. Variables 입력
5. 첫 배포 실행

---

## 3. 배포 후 검증 순서

1) backend-core
- `/health` 200
- `/events` 빈 배열 또는 데이터 정상

2) web
- 대시보드 진입 가능
- 연결 상태 배지 정상

3) mock-sensor
- collector로 2xx 전송 로그 확인

4) end-to-end
- web에서 센서값 실시간 갱신 확인

---

## 4. smoke test 시나리오

- 시나리오 A: 5분 연속 실시간 수신
- 시나리오 B: backend 재시작 후 SSE 재연결
- 시나리오 C: mock-sensor 중지/재시작 복구

---

## 5. 장애 대응 가이드

### Case 1. SSE 끊김
- web 콘솔 EventSource 에러 확인
- backend `/stream` 응답헤더 확인
- heartbeat 주기 점검

### Case 2. 데이터 없음
- mock-sensor 로그의 collector 호출 확인
- collector 유효성 검증 실패 로그 확인
- `/events` 직접 조회

### Case 3. 메모리 상승
- buffer size 축소 (`EVENT_BUFFER_SIZE`)
- 이벤트 생성 주기 완화

---

## 6. 운영 메트릭(최소)

- ingest TPS
- SSE active connection count
- event processing latency(ms)
- backend memory usage(MB)

---

## 7. 릴리즈 규칙

- 작은 단위로 자주 배포
- 배포마다 CHANGELOG 남기기
- 장애 발생 시 즉시 이전 커밋 롤백
