#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 项目名称（取自上级目录名，与项目同名）
PROJECT_NAME=$(basename "$(dirname "$(pwd)")")

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
if [ "${1:-}" = "--build" ] || ! podman image exists "${PROJECT_NAME}-service" || ! podman image exists "${PROJECT_NAME}-web"; then
  echo "[up] 构建 service 镜像..."
  podman build -t "${PROJECT_NAME}-service" -f Dockerfile.service ../../../
  echo "[up] 构建 web 镜像..."
  podman build -t "${PROJECT_NAME}-web" -f ../web/Dockerfile \
    --build-arg NEXT_PUBLIC_BASE_URL="" \
    --build-arg NEXT_PUBLIC_SUB_VERSION="/b/${PROJECT_NAME}/graphql" \
    ../web
fi

# ============================================
# 2. 创建 Pod（已存在则跳过）
#    haproxy:8080 -> pod:8080 -> 宿主机:8013
# ============================================
if ! podman pod exists "${PROJECT_NAME}"; then
  podman pod create --name "${PROJECT_NAME}" -p 8013:8080
  echo "[up] Pod ${PROJECT_NAME} 已创建，端口映射 8013:8080"
fi

# ============================================
# 3. 创建数据卷（已存在则跳过）
# ============================================
if ! podman volume exists "${PROJECT_NAME}_db"; then
  podman volume create "${PROJECT_NAME}_db"
  echo "[up] 数据卷 ${PROJECT_NAME}_db 已创建"
fi

# ============================================
# 4. 启动容器（已存在则跳过）
# ============================================

# -- db --
if ! podman container exists "${PROJECT_NAME}-db"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-db" \
    --restart unless-stopped \
    -e POSTGRES_DB="${POSTGRES_DB:-${PROJECT_NAME}}" \
    -e POSTGRES_USER="${POSTGRES_USER:-postgres}" \
    -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -v "${PROJECT_NAME}_db":/var/lib/postgresql \
    -v ./init:/docker-entrypoint-initdb.d:ro \
    --health-cmd "pg_isready -U ${POSTGRES_USER:-postgres} -d ${POSTGRES_DB:-${PROJECT_NAME}}" \
    --health-interval 10s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 20s \
    docker.io/library/postgres:18
  echo "[up] ${PROJECT_NAME}-db 已启动"
else
  echo "[up] ${PROJECT_NAME}-db 已存在，跳过"
fi

# 等待 db 就绪
echo "[up] 等待 db 健康检查通过..."
for i in $(seq 1 60); do
  status=$(podman inspect "${PROJECT_NAME}-db" --format '{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
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
if ! podman container exists "${PROJECT_NAME}-service"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-service" \
    --restart unless-stopped \
    --env-file .env \
    -e DB_NAME="${POSTGRES_DB:-${PROJECT_NAME}}" \
    -e DB_HOST=127.0.0.1 \
    -e DB_PORT=5432 \
    -e DB_USERNAME="${POSTGRES_USER:-postgres}" \
    -e DB_PASSWORD="${POSTGRES_PASSWORD:-P@sspostgres!}" \
    -e PROJECT_PATH=/app/i-Torch \
    -v ./.env:/app/i-Torch/.env:ro \
    -v ../logs:/app/i-Torch/logs \
    --health-cmd "curl -s -o /dev/null http://127.0.0.1:7000/b/${PROJECT_NAME}/graphql || exit 1" \
    --health-interval 15s \
    --health-timeout 5s \
    --health-retries 10 \
    --health-start-period 30s \
    "${PROJECT_NAME}-service"
  echo "[up] ${PROJECT_NAME}-service 已启动"
else
  echo "[up] ${PROJECT_NAME}-service 已存在，跳过"
fi

# -- web --
if ! podman container exists "${PROJECT_NAME}-web"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-web" \
    --restart unless-stopped \
    "${PROJECT_NAME}-web"
  echo "[up] ${PROJECT_NAME}-web 已启动"
else
  echo "[up] ${PROJECT_NAME}-web 已存在，跳过"
fi

# -- haproxy --
if ! podman container exists "${PROJECT_NAME}-haproxy"; then
  podman run -d \
    --pod "${PROJECT_NAME}" \
    --name "${PROJECT_NAME}-haproxy" \
    --restart unless-stopped \
    -v ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro \
    docker.io/library/haproxy:3.0
  echo "[up] ${PROJECT_NAME}-haproxy 已启动"
else
  echo "[up] ${PROJECT_NAME}-haproxy 已存在，跳过"
fi

echo "[up] 所有服务已启动"
podman pod ls --filter "name=${PROJECT_NAME}"
podman ps --filter "pod=${PROJECT_NAME}" --format "table {{.Names}}\t{{.Status}}"
