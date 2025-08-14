# 시스템 안정화 스크립트

메인 프로그램과 **별도로 실행**하여 시스템을 안정화하는 독립 스크립트입니다.

## 🎯 주요 기능

### 1. `/tmp` 디렉토리 정리
- Chrome 임시 파일 (`.com.google.Chrome.*`)
- Playwright 임시 파일
- NPM 임시 파일  
- 기타 10분 이상된 모든 임시 파일

### 2. 시스템 리소스 모니터링
- 메모리 사용률 체크
- 디스크 사용률 체크
- Chrome 프로세스 개수 확인

### 3. 적극적 정리 (옵션)
- 좀비 Chrome 프로세스 정리
- 프로젝트 로그 파일 정리

## 🚀 사용법

### 기본 사용법

```bash
# 한 번만 실행 (기본)
node system-stabilizer.js

# 또는
node system-stabilizer.js --once
```

### 데몬 모드 (권장)

```bash
# 10분마다 자동 실행
node system-stabilizer.js --daemon

# 5분마다 실행
node system-stabilizer.js --daemon --interval 5

# 백그라운드 실행
nohup node system-stabilizer.js --daemon > stabilizer.log 2>&1 &
```

### 적극적 정리 모드

```bash
# Chrome 프로세스도 정리
node system-stabilizer.js --daemon --aggressive

# 한 번만 적극적 정리
node system-stabilizer.js --once --aggressive
```

## 📋 옵션 설명

| 옵션 | 짧은 형태 | 설명 | 기본값 |
|------|-----------|------|--------|
| `--once` | `-o` | 한 번만 실행 | 기본값 |
| `--daemon` | `-d` | 데몬 모드 (지속 실행) | - |
| `--aggressive` | `-a` | 적극적 정리 (Chrome 프로세스 포함) | 비활성 |
| `--interval` | `-i` | 데몬 모드 실행 간격 (분) | 10분 |
| `--temp-age` | `-t` | 임시 파일 정리 기준 (분) | 10분 |
| `--help` | `-h` | 도움말 표시 | - |

## 📊 실행 결과 예시

```
🔧 시스템 안정화 스크립트 시작
   모드: 데몬
   정리 주기: 10분
   임시 파일 기준: 10분 이상
   적극적 모드: 활성

🧹 [1회] 시스템 안정화 시작 - 14:30:15
   🧹 /tmp 디렉토리 정리 중...
      ✅ /tmp 정리: 45.2 MB 확보
   🔧 Chrome 프로세스 정리 중...
      🔧 Chrome 프로세스 종료: PID 12345 (메모리: 12.5%)
      🔧 Chrome 프로세스 종료: PID 12346 (메모리: 15.2%)
   📋 프로젝트 로그 정리 중...
      ✅ 프로젝트 로그: 3개 파일 정리
✅ 정리 완료: 15개 파일, 45.7 MB 확보 (1250ms)
   📊 시스템 상태:
      메모리: 72%
      디스크: 28%
      Chrome: 8개 프로세스
      /tmp: 12.3 MB
```

## 🔄 권장 운영 방식

### 1. 메인 프로그램과 분리 실행

```bash
# 터미널 1: 메인 프로그램
node index.js --api --threads 20

# 터미널 2: 안정화 스크립트
node system-stabilizer.js --daemon --aggressive
```

### 2. 백그라운드 데몬으로 실행

```bash
# 백그라운드 실행 (로그 파일로 출력)
nohup node system-stabilizer.js --daemon --aggressive > logs/stabilizer.log 2>&1 &

# 실행 상태 확인
tail -f logs/stabilizer.log

# 프로세스 확인
ps aux | grep system-stabilizer

# 종료 (필요시)
pkill -f system-stabilizer
```

### 3. systemd 서비스로 등록 (선택사항)

```bash
# 서비스 파일 생성
sudo nano /etc/systemd/system/coupang-stabilizer.service
```

```ini
[Unit]
Description=Coupang System Stabilizer
After=network.target

[Service]
Type=simple
User=tech
WorkingDirectory=/home/tech/coupang_agent_v1
ExecStart=/usr/bin/node system-stabilizer.js --daemon --aggressive
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
# 서비스 활성화
sudo systemctl daemon-reload
sudo systemctl enable coupang-stabilizer
sudo systemctl start coupang-stabilizer

# 상태 확인
sudo systemctl status coupang-stabilizer
```

## ⚠️ 주의사항

1. **안전한 정리**: 10분 이상된 `/tmp` 파일만 정리하므로 안전
2. **적극적 모드**: Chrome 프로세스를 정리하므로 메인 프로그램과 충돌 가능성 있음
3. **권한**: `/tmp` 정리를 위해 적절한 권한 필요
4. **로그 확인**: 정기적으로 로그를 확인하여 정상 작동 여부 체크

## 🔍 문제 해결

### 권한 오류 시
```bash
# 실행 권한 확인
chmod +x system-stabilizer.js

# /tmp 접근 권한 확인
ls -la /tmp
```

### 프로세스 확인
```bash
# 실행 중인 안정화 스크립트 확인
ps aux | grep system-stabilizer

# 로그 실시간 확인
tail -f logs/stabilizer.log
```

### 강제 종료
```bash
# 모든 안정화 스크립트 종료
pkill -f system-stabilizer
```

## 📈 성능 개선 효과

### 20개 쓰레드 24시간 실행 시:

**안정화 스크립트 없음:**
- `/tmp`: 수백 개 Chrome 임시 파일 (수 GB)
- 메모리: 좀비 프로세스로 인한 누수
- 성능: 시간이 지날수록 저하

**안정화 스크립트 사용:**
- `/tmp`: 최소한의 임시 파일 유지 (수십 MB)
- 메모리: 정기적인 프로세스 정리
- 성능: 안정적인 장기 운영 가능