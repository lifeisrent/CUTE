# CUTE Taskflow (MVP)

## Phase 0. 부트스트랩
- [ ] 모노레포 기본 구조 생성
- [ ] 서비스별 환경변수 템플릿 작성
- [ ] 로컬 통합 실행 방식 정의 (docker-compose or pnpm workspaces)

## Phase 1. Mock Sensor 서비스
- [ ] 센서 이벤트 포맷 정의 (temperature, humidity, power, timestamp)
- [ ] 주기 발행 엔드포인트/프로세스 구현
- [ ] 실시간 DB 서비스로 이벤트 전송

## Phase 2. Realtime DB 서비스
- [ ] 이벤트 수신 API 구현
- [ ] 메모리 저장소(초기) + 최근 N개 조회 API
- [ ] WebSocket/SSE 스트림 제공

## Phase 3. Mobile Web 대시보드
- [ ] 실시간 카드 UI (센서별 현재값)
- [ ] 최근 이벤트 리스트
- [ ] 제어 버튼 UI (mock command)

## Phase 4. 통합/검증
- [ ] mock sensor -> db -> dashboard 데이터 흐름 확인
- [ ] 지연/누락/오류 로그 점검
- [ ] 모바일 뷰 최적화

## API Draft
- `POST /ingest` (sensor event 입력)
- `GET /events?limit=50` (최근 이벤트)
- `GET /stream` (SSE)
- `POST /control` (mock 제어 명령)

## 데이터 모델(초안)
```json
{
  "sensorId": "mock-1",
  "type": "temperature",
  "value": 23.4,
  "unit": "C",
  "timestamp": "2026-04-13T01:00:00.000Z"
}
```
