# 신규 센서 종류 무중단 추가 설계 (Hot Add)

목표: 서비스 중단 없이 새로운 센서 타입(시리얼/모드버스/복합/아날로그 변환/상태값 포함)을 단계적으로 추가할 수 있는 구조를 정의한다.

---

## 1) 현재 문서와 겹치는 내용 확인

기존 문서에서 이미 있는 기반:
- `taskflow.md`
  - 인터페이스 우선 고정
  - 단계적 분리
  - SSE 채널 유지
- `06-sensor-lifecycle-scenarios.md`
  - 센서 상태머신
  - 통신 ON/OFF, loop START/STOP
  - 다운/재연결 시나리오

이번 문서에서 추가하는 핵심:
- **신규 센서 타입 무중단 추가 절차**
- **프로토콜별 어댑터 구조**
- **복합/아날로그/상태값 확장 모델**

---

## 2) 무중단 확장 핵심 원칙

1. **수집(Collector)와 센서 프로토콜 구현을 분리**
2. 신규 타입은 **Adapter 플러그인**으로 추가
3. 데이터는 Collector에서 **정규화(Normalization)** 후 공통 Envelope로 변환
4. 기존 소비자(web/SSE)는 공통 Envelope만 보게 유지
5. 스키마 확장은 **backward-compatible**로만 진행

---

## 3) 권장 구조

### 3-1. Sensor Adapter 레이어
- `adapter/serial`
- `adapter/modbus`
- `adapter/mock`
- `adapter/composite`

공통 인터페이스(개념):
```ts
interface SensorAdapter {
  kind: string; // serial | modbus | mock | ...
  start(config): Promise<void>
  stop(): Promise<void>
  read(): Promise<RawSensorPacket[]>
  health(): AdapterHealth
}
```

### 3-2. Normalize 레이어
Raw packet -> 공통 Event Envelope 변환

```json
{
  "eventId": "evt_x",
  "traceId": "tr_x",
  "sensorId": "site-1:modbus-01",
  "source": "A",
  "type": "power",
  "value": 312.4,
  "unit": "W",
  "timestamp": "...",
  "meta": {
    "protocol": "modbus",
    "register": 40021,
    "quality": "good"
  }
}
```

`meta`는 선택 필드로 확장해 기존 소비자 영향 최소화.

---

## 4) 센서 유형별 추가 전략

### A) 시리얼(Serial)
- 포트 스캔/선점 문제를 adapter에서만 처리
- 프레임 파싱 실패는 `quality=bad` + error code로 노출
- 재연결 backoff를 adapter 내부에서 수행

### B) 모드버스(Modbus)
- register map을 설정파일로 분리
- 값 변환(scale/offset) 규칙을 map에 선언
- timeout/CRC 오류는 adapter error metrics로 집계

### C) 복합 센서(Composite)
- 한 장치에서 다중 type(온도/습도/압력) 방출
- normalize 단계에서 이벤트 여러 개 fan-out
- 같은 `traceId`로 묶어 상관관계 유지

### D) 아날로그 값 변환 필요
- 변환 파이프라인: raw -> calibration -> engineering unit
- 예: `value = raw * scale + offset`
- 보정 파라미터 버전 관리 (`calibrationVersion`)

### E) 센서 상태값 추가 전송
- `sensor.status` 이벤트 타입 추가
- 예: battery, signal, faultCode, online/offline
- 데이터값(type=value)은 유지 + 상태는 별도 스트림 이벤트로 분리

---

## 5) 무중단 배포 시나리오

1. adapter 코드 추가 (비활성 상태)
2. feature flag/registry에 신규 adapter 등록
3. canary sensor 1대만 enable
4. metrics 확인 (error rate, latency, parse fail)
5. 점진 확대
6. 문제 시 flag off로 즉시 롤백

---

## 6) 변경 관리 (Schema/Contract)

규칙:
- 기존 필드 삭제 금지
- 신규 필드는 optional로만 추가
- `type` 신규 값 추가 시 UI unknown fallback 필수

버전 전략:
- Envelope 자체는 `v1` 유지
- `meta.schemaVersion`으로 세부 확장 추적

---

## 7) 에러 코드 대역 제안 (신규)

- 2100~2199: 유닛/변환 오류
  - 2101 scale/offset 미설정
  - 2102 변환 결과 NaN
- 2200~2299: 프로토콜 파싱 오류
  - 2201 serial frame parse fail
  - 2202 modbus CRC/timeout
- 2300~2399: 상태값 전송 오류
  - 2301 status payload invalid

---

## 8) 구현 우선순위

1. Adapter interface 도입 (mock 유지)
2. normalize + meta 확장
3. `sensor.status` 이벤트 추가
4. serial adapter PoC
5. modbus adapter PoC
6. composite/analog calibration 적용

---

## 9) 수용 기준 (AC)

- [ ] 신규 센서 타입 추가 시 기존 web 대시보드 중단 없음
- [ ] unknown type이 와도 UI 크래시 없음
- [ ] 변환 실패는 데이터 손실 대신 오류 이벤트/코드로 표준화
- [ ] 서비스 재시작 없이 adapter enable/disable 가능
