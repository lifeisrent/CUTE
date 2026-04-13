# CUTE

모니터링·제어 통합 모바일 웹앱

## 목표
- 여러 센서/장치 상태를 모바일 웹에서 실시간 모니터링
- 필요한 제어 명령을 같은 화면에서 수행
- 데이터 수집/저장/전송 계층을 서비스 분리로 확장 가능하게 설계

## MVP 범위
1. 데이터 모니터링 대시보드 (모바일 우선)
2. 실시간 데이터베이스 서비스 (수집/조회 API)
3. mock 센서 통신 서비스 분리

## 구조
- `apps/mobile-web` : 사용자 모바일 웹 UI
- `services/realtime-db` : 실시간 데이터 저장/조회 API
- `services/mock-sensor` : 가짜 센서 이벤트 생성기

## 로컬 실행
```bash
npm install
npm run dev:core   # terminal 1
npm run dev:sensor # terminal 2
npm run dev:web    # terminal 3
```

접속: `http://localhost:3200`

세부는 각 서비스 README 참고.
