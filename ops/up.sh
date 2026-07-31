#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 加载 .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "[up] 已从 .env.example 生成 .env，请按需修改后重新运行"
  exit 1
fi
source .env

# ============================================
# 1. 构建镜像（若不存在或指定 --build）
# ============================================
if [ "${1:-}" = "--build" ] || ! podman image exists id_x_013-service || ! podman image exists id_x_013-web; then
  echo "[up] 构建 service 镜像..."
  podman build -t id_x_013-service -f Dockerfile.service ../../../
  echo "[up] 构建 web 镜像..."
  podman build -t id_x_013-web -f ../web/Dockerfile ../web
fi

# ============================================
# 2. 创建 Pod（已存在则跳过）
#    haproxy:8080 -> pod:8080 -> 宿主机:8085
# ============================================
if ! podman pod exists id_x_013; then
  podman pod create --name id_x_013 -p 8085:8080
  echo "[up] Pod id_x_013 已创建，端口映射 8085:8080"
fi

# ============================================
# 3. 创建数据卷（已存在则跳过）
# ============================================
if ! podman volume exists id_x_013_db; then
  podman volume create id_x_013_db
  echo "[up] 数据卷 id_x_013_db 已创建"
fi

# ============================================
# 4. 启动容器（已运行则跳过）
# ============================================

# -- db --
if ! podman container exists id_x_013-db; then
  podman run -d \
    --pod id_x_013 \
    --name id_x_013-db \
    --restart unless-stopped \
    -e POSTGRES_DB="${POSTGRES_DB:-id_x_013}" \
    -e POSTGRES_USER="${POSTGRES_USER:-postgres}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -v id_x_013_db:/var/lib/postgresql \
    -v ./init:/docker-entrypoint-initdb.d:ro \
    --health-cmd "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-id_x_013}" \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 20s \
    postgres:18
  echo "[up] id_x_013-db 已启动"
else
  echo "[up] id_x_013-db 已存在，跳过"
fi

# 等待 db 就绪
echo "[up] 等待 db 健康检查通过..."
for i in $(seq 1 60); do
  status=$(podman inspect id_x_013-db --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
  if [ "$status" = "healthy" ]; then
    echo "[up] db 已就绪"
    break
  fi
  if [ "$i" = "60" ]; then
    echo "[up] 等待 db 超时，继续启动..."
  fi
  sleep 1
done

# -- service --
if ! podman container exists id_x_013-service; then
  podman run -d \
    --pod id_x_013 \
    --name id_x_013-service \
    --restart unless-stopped \
    --env-file .env \
    -e DB_NAME="${POSTGRES_DB:-id_x_013}" \
    -e DB_HOST=127.0.0.1 \
    -e DB_PORT=5432 \
    -e DB_USERNAME="${POSTGRES_USER:-postgres}" \
    -e DB_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -e PROJECT_PATH=/app/id_x_000 \
    -v ./.env:/app/id_x_000/.env:ro \
    -v ../logs:/app/id_x_000/logs \
    --health-cmd "curl -s -o /dev/null http://127.0.0.1:8000/b/id_x_013/graphql || exit 1" \
    --health-interval 15s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 30s \
    id_x_013-service
  echo "[up] id_x_013-service 已启动"
else
  echo "[up] id_x_013-service 已存在，跳过"
fi

# -- web --
if ! podman container exists id_x_013-web; then
  podman run -d \
    --pod id_x_013 \
    --name id_x_013-web \
    --restart unless-stopped \
    id_x_013-web
  echo "[up] id_x_013-web 已启动"
else
  echo "[up] id_x_013-web 已存在，跳过"
fi

# -- haproxy --
if ! podman container exists id_x_013-haproxy; then
  podman run -d \
    --pod id_x_013 \
    --name id_x_013-haproxy \
    --restart unless-stopped \
    -v ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
    haproxy:3.0
  echo "[up] id_x_013-haproxy 已启动"
else
  echo "[up] id_x_013-haproxy 已存在，跳过"
fi

echo "[up] 所有服务已启动"
podman pod ls --filter name=id_x_013
