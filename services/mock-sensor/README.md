# mock-sensor (A)

가짜 센서 데이터를 collector로 주기 전송.

## 실행
```bash
npm install
npm run dev --workspace services/mock-sensor
```

## 엔드포인트
- `GET /health`
- `POST /emit-once`
