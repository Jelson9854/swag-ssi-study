# SWAG Production Deployment Guide

이 문서는 SWAG 애플리케이션을 HTTPS로 자체 서버에 배포하는 방법을 설명합니다.

## 사전 요구사항

### 서버 환경
- Rocky Linux 9 (또는 RHEL 계열 Linux)
- Root 또는 sudo 권한
- 최소 2GB RAM
- 10GB 이상의 디스크 공간

### 필수 소프트웨어
- Node.js 20+
- Podman
- PostgreSQL 15+
- Nginx
- Certbot (Let's Encrypt SSL)

## 1. 서버 준비

### 1.1 필수 패키지 설치

```bash
# 시스템 업데이트
sudo dnf update -y

# Node.js 20 설치
sudo dnf module enable nodejs:20 -y
sudo dnf install nodejs -y

# Podman 설치
sudo dnf install -y podman

# PostgreSQL 설치
sudo dnf install -y postgresql-server postgresql-contrib

# Nginx 설치
sudo dnf install -y nginx

# Certbot 설치 (Let's Encrypt)
sudo dnf install -y certbot python3-certbot-nginx

# Git 설치 (코드 클론용)
sudo dnf install -y git
```

### 1.2 PostgreSQL 초기화

```bash
# PostgreSQL 초기화 (처음 설치 시)
sudo postgresql-setup --initdb

# PostgreSQL 시작 및 자동 시작 설정
sudo systemctl start postgresql
sudo systemctl enable postgresql

# PostgreSQL 접속 설정 (로컬 접속 허용)
sudo sed -i 's/ident/md5/g' /var/lib/pgsql/data/pg_hba.conf
sudo systemctl restart postgresql
```

### 1.3 Nginx 시작

```bash
sudo systemctl start nginx
sudo systemctl enable nginx

# 방화벽 설정
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

## 2. 프로젝트 설정

### 2.1 코드 가져오기

```bash
# 작업 디렉토리로 이동
cd /home/your-user/

# Git 클론 또는 코드 복사
git clone <your-repo-url> swag
cd swag

# 또는 로컬에서 복사한 경우
# cd swag
```

### 2.2 의존성 설치

```bash
npm install
```

### 2.3 환경 변수 설정

`.env.example` 파일을 참고하여 필요한 환경 변수를 설정합니다.
배포 스크립트가 자동으로 `.env.production` 파일을 생성하지만,
추가 환경 변수가 필요한 경우 수동으로 편집할 수 있습니다.

```bash
# 필요한 경우 .env.production 편집
nano .env.production
```

필수 환경 변수:
- `DATABASE_URL`: PostgreSQL 연결 문자열
- `POSTGRES_URL`: PostgreSQL 연결 문자열 (DATABASE_URL과 동일)
- `NEXT_PUBLIC_APP_URL`: 애플리케이션 URL (https://your-domain.com)

선택적 환경 변수:
- OpenAI API 키 등

## 3. 배포 실행

### 3.1 자동 배포 스크립트 사용

배포 스크립트는 다음을 자동으로 수행합니다:
1. PostgreSQL 데이터베이스 및 사용자 생성
2. 데이터베이스 마이그레이션 실행
3. Docker 이미지 빌드
4. 컨테이너 실행
5. Nginx 설정

```bash
# 실행 권한 부여 (이미 되어 있음)
chmod +x deploy.sh

# 배포 실행 (도메인 이름을 인자로 전달)
./deploy.sh your-domain.com
```

### 3.2 SSL 인증서 발급

배포 스크립트가 완료되면, Certbot을 사용하여 SSL 인증서를 발급받습니다:

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot이 자동으로:
- SSL 인증서를 발급받고
- Nginx 설정을 업데이트하고
- 자동 갱신을 설정합니다

### 3.3 인증서 자동 갱신 확인

```bash
# 자동 갱신 테스트
sudo certbot renew --dry-run

# 갱신 타이머 확인
sudo systemctl status certbot-renew.timer
```

## 4. 배포 확인

### 4.1 컨테이너 상태 확인

```bash
# 컨테이너가 실행 중인지 확인
podman ps

# 컨테이너 로그 확인
podman logs swag

# 실시간 로그 보기
podman logs -f swag
```

### 4.2 Health Check

```bash
# 헬스 체크 API 호출
curl http://localhost:3000/api/health

# HTTPS로 확인
curl https://your-domain.com/api/health
```

### 4.3 Nginx 상태 확인

```bash
# Nginx 상태
sudo systemctl status nginx

# Nginx 에러 로그
sudo tail -f /var/log/nginx/error.log

# Nginx 액세스 로그
sudo tail -f /var/log/nginx/access.log
```

## 5. 유지보수

### 5.1 애플리케이션 업데이트

```bash
# 코드 업데이트
cd /home/your-user/swag
git pull

# 의존성 업데이트 (필요한 경우)
npm install

# 재배포
./deploy.sh your-domain.com
```

### 5.2 컨테이너 관리

```bash
# 컨테이너 재시작
podman restart swag

# 컨테이너 중지
podman stop swag

# 컨테이너 시작
podman start swag

# 컨테이너 삭제
podman rm swag

# 이미지 삭제
podman rmi swag:latest
```

### 5.3 데이터베이스 관리

```bash
# PostgreSQL 접속
sudo -u postgres psql

# 데이터베이스 백업
sudo -u postgres pg_dump swag > swag_backup_$(date +%Y%m%d).sql

# 데이터베이스 복원
sudo -u postgres psql swag < swag_backup_YYYYMMDD.sql

# 데이터베이스 마이그레이션
npm run db:migrate
```

### 5.4 로그 관리

```bash
# Podman 로그 확인
podman logs swag --tail 100

# Nginx 로그 확인
sudo tail -100 /var/log/nginx/error.log
sudo tail -100 /var/log/nginx/access.log

# PostgreSQL 로그 확인
sudo tail -100 /var/lib/pgsql/data/log/postgresql-*.log
```

## 6. 문제 해결

### 6.1 컨테이너가 시작되지 않음

```bash
# 로그 확인
podman logs swag

# 환경 변수 확인
podman exec swag env | grep DATABASE_URL

# 컨테이너 재시작
podman restart swag
```

### 6.2 데이터베이스 연결 오류

```bash
# PostgreSQL이 실행 중인지 확인
sudo systemctl status postgresql

# 데이터베이스 연결 테스트
psql "postgresql://swag:swag@localhost:5432/swag" -c "SELECT 1"

# pg_hba.conf 확인
sudo cat /var/lib/pgsql/data/pg_hba.conf
```

### 6.3 Nginx 502 Bad Gateway

```bash
# 컨테이너가 실행 중인지 확인
podman ps | grep swag

# 포트가 바인딩되었는지 확인
ss -tlnp | grep 3000

# Nginx 설정 테스트
sudo nginx -t

# SELinux 문제 (Rocky Linux)
sudo setsebool -P httpd_can_network_connect 1
```

### 6.4 SSL 인증서 문제

```bash
# 인증서 갱신
sudo certbot renew

# 인증서 상태 확인
sudo certbot certificates

# Nginx 재시작
sudo systemctl restart nginx
```

## 7. 보안 권장사항

### 7.1 방화벽 설정

```bash
# 필요한 포트만 열기
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --reload
```

### 7.2 자동 업데이트 설정

```bash
# dnf-automatic 설치
sudo dnf install -y dnf-automatic

# 보안 업데이트 자동 설치
sudo systemctl enable --now dnf-automatic.timer
```

### 7.3 환경 변수 보안

```bash
# .env.production 파일 권한 설정
chmod 600 .env.production

# 민감한 정보는 환경 변수로 관리
# 절대 Git에 커밋하지 않기
```

## 8. 성능 최적화

### 8.1 Podman 리소스 제한

```bash
# CPU 및 메모리 제한을 두고 실행
podman run -d \
  --name swag \
  --restart=always \
  --cpus=2 \
  --memory=2g \
  -p 127.0.0.1:3000:3000 \
  --env-file .env.production \
  swag:latest
```

### 8.2 PostgreSQL 튜닝

```bash
# /var/lib/pgsql/data/postgresql.conf 편집
sudo nano /var/lib/pgsql/data/postgresql.conf

# 권장 설정 (2GB RAM 기준)
# shared_buffers = 512MB
# effective_cache_size = 1536MB
# maintenance_work_mem = 128MB
# checkpoint_completion_target = 0.9
# wal_buffers = 16MB
# default_statistics_target = 100
# random_page_cost = 1.1
# work_mem = 5MB
# min_wal_size = 1GB
# max_wal_size = 4GB
```

## 9. 모니터링

### 9.1 시스템 리소스 모니터링

```bash
# CPU 및 메모리 사용량
top
htop  # 설치 필요: sudo dnf install htop

# 디스크 사용량
df -h

# 컨테이너 리소스 사용량
podman stats swag
```

### 9.2 로그 모니터링

```bash
# 실시간 로그 모니터링
podman logs -f swag

# 로그 검색
podman logs swag 2>&1 | grep ERROR
```

## 10. 백업 전략

### 10.1 데이터베이스 자동 백업

```bash
# 백업 스크립트 생성
cat > ~/backup-swag.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/home/your-user/backups"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# PostgreSQL 백업
sudo -u postgres pg_dump swag | gzip > $BACKUP_DIR/swag_$DATE.sql.gz

# 7일 이상 된 백업 삭제
find $BACKUP_DIR -name "swag_*.sql.gz" -mtime +7 -delete

echo "Backup completed: swag_$DATE.sql.gz"
EOF

chmod +x ~/backup-swag.sh

# Cron으로 매일 자동 백업 (새벽 2시)
(crontab -l 2>/dev/null; echo "0 2 * * * /home/your-user/backup-swag.sh") | crontab -
```

## 지원

문제가 발생하면:
1. 로그를 확인하세요 (컨테이너, Nginx, PostgreSQL)
2. Health check API를 호출하세요
3. 문제 해결 섹션을 참고하세요

## 라이선스

이 배포 가이드는 SWAG 프로젝트의 일부입니다.
