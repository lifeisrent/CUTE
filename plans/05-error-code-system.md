# CUTE Error Code System (초안)

목표: 개발 중 발생하는 에러를 임의 문구가 아니라 **코드 기반**으로 관리해, 원인 분석/재현/수정/문서화를 빠르게 만든다.

---

## 1) 왜 필요한가

현재 메시지 예:
- "실시간 스트림 연결 실패: backend CORS_ORIGINS ..."

문제:
- 문구가 바뀌면 검색/집계가 어려움
- UI/로그/문서가 1:1로 연결되지 않음

해결:
- 모든 에러에 **고유 코드** 부여
- UI에는 `코드 + 사람 친화 메시지`
- 로그에는 `코드 + 기술 상세`

---

## 2) 코드 규칙

형식(간소화):
- `<번호 4자리>`

예시:
- `1000` (IP 오류)
- `1001` (CORS 오류)
- `3001` (프론트 제어 요청 실패)

대역:
- `1000`대: 네트워크/접속 (IP/CORS/스트림)
- `2000`대: 유닛/데이터/스키마 (순서는 뒤에서 세부 확정)
- `3000`대: 프론트(UI/상태/제어)
- 추후 `4000`대 이상 확장 가능

규칙:
1. 같은 원인은 같은 코드 재사용
2. 코드 재사용 시 메시지는 변경 가능 (의미는 유지)
3. 삭제 대신 `deprecated: true` 처리
4. 코드 접두어(`CUTE`, `NET`)는 사용하지 않는다

---

## 3) 데이터 모델(카탈로그)

```json
{
  "1001": {
    "severity": "error",
    "layer": "WEB",
    "title": "CORS 오류",
    "userMessage": "백엔드에 도메인을 추가하세요.",
    "devHint": "backend CORS_ORIGINS에 web 도메인 추가",
    "runbook": "plans/03-deployment-runbook.md#case-1-sse-끊김"
  }
}
```

---

## 4) MVP 적용 범위

1. Web UI 네트워크/스트림/제어 실패
2. Core control relay 실패
3. Sensor collector 전송 실패

---

## 5) 단계별 적용 계획

### Phase A (지금)
- [x] 코드 체계 문서화
- [x] error catalog JSON 초기 생성
- [ ] web에서 하드코딩 문구 -> catalog lookup 전환

### Phase B
- [ ] core/sensor 로그에 error code 삽입
- [ ] 응답 body에 `errorCode` 필드 추가

### Phase C
- [ ] UI에 "코드 복사" 버튼
- [ ] runbook deep-link 연결

---

## 6) 우선 등록 코드

- `1000`: IP 오류
- `1001`: CORS 오류 (백엔드에 도메인을 추가하세요)
- `1002`: SSE 연결 실패
- `3001`: 프론트 제어 요청 실패
- `4001`: backend control relay 실패 (SENSOR_CONTROL_URL 미도달)
- `5001`: mock-sensor -> collector 전송 실패

---

## 7) 운영 원칙

- 에러 문구를 바꾸기 전에 코드 먼저 정한다.
- 코드 없는 에러는 PR에서 반려한다.
- runbook 링크 없는 error code는 TODO로 표시한다.
- DB보다 **JSON 카탈로그 단일 파일**을 source of truth로 유지한다.
- 코드 생성/수정 시 에러 코드 규칙을 프롬프트/리뷰 체크리스트에 고정한다.

### 7-1) PR 체크리스트(에러 코드)
- [ ] 신규 에러에 코드 부여됨
- [ ] `error-catalog.json` 등록됨
- [ ] UI/응답/로그 코드 일치
- [ ] userMessage + devHint 분리됨

