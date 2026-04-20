# CUTE Exit Criteria (Engineering Completion)

목적: CUTE를 "UI 실험"이 아니라, 실제 자동화 시스템 엔지니어링 자산으로 종료(졸업)시키기 위한 기준.

---

## 종료 기준

1. 서버 재시작 무중단 복구
- backend-core 재시작 후 10초 이내 센서 스트림 재유입
- 웹 UI 새로고침 없이 값이 다시 갱신됨

2. 메인/백업 서버 페일오버
- 메인 다운 시 백업이 15초 이내 수집/스트림 승계
- 데이터 공백은 최대 15초 이하

3. 드라이버 파이프라인 강제
- mock-sensor 직송 차단 유지 (`ENFORCE_DRIVER_PIPELINE=true`)
- raw -> modbus-driver -> /collect 경로만 허용

4. 상태 가시성 확보
- backend-core / mock-sensor / modbus-driver 상태를 UI에서 확인 가능
- last success time / failure count / current state 표시

5. 장애 재현 가능성
- disconnect/reconnect/probe/failover 시나리오를 버튼 또는 명령으로 반복 실행 가능
- 각 시도 traceId 기준으로 로그 추적 가능

6. 에러코드 2층 메시지
- 사용자 메시지와 개발자 메시지 분리
- likelyPath, firstAction, runbook 연결 포함

7. 런북 완성
- 신규 환경에서 30~60분 내 재현 가능한 배포/복구 절차 문서
- 장애 시 최초 5분 점검 체크리스트 포함

8. 장기 구동 안정성
- 24시간 soak test에서 메모리/스트림/복구 지표 허용 범위 유지

9. 대량 트래픽 부하 테스트 가능
- 트래픽 생성기(가상 센서/이벤트 폭주)로 재현 가능
- 부하 테스트를 반복 가능한 스크립트/절차로 실행 가능

10. 대량 트래픽 대응 경험 문서화
- 병목 지점 식별(ingest/stream/buffer/network)
- 완화 조치 실행 및 전/후 지표 비교 기록
- 대응 회고를 문서로 남겨 재사용 가능

---

## PASS/FAIL 판단 템플릿

각 기준은 아래 형식으로 점검한다.

```md
- Criterion: (번호/이름)
- Result: PASS | FAIL
- Evidence: (로그/스크린샷/링크)
- Measured: (복구 시간, 오류율, 지연 등)
- Next Action: (FAIL 시 조치)
```

---

## 운영 지표 (권장)

- ingest TPS
- SSE active connections
- p95 ingest latency
- reconnect success rate
- failover recovery time
- errorCode별 발생 빈도

---

## 졸업 선언 조건

- 상기 10개 기준에서 FAIL 0개
- 최소 1회 이상 부하 대응 회고 문서 완료
- 재현 가능한 운영/복구 runbook 최신 상태 유지
