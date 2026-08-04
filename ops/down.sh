#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# 项目名称（取自上级目录名，与项目同名）
PROJECT_NAME=$(basename "$(dirname "$(pwd)")")

# ============================================
# 仅停止 Pod 中的容器（顺序与启动相反）
# 保留 Pod / 容器 / 数据卷 / 镜像，便于后续重启
# ============================================
for name in "${PROJECT_NAME}-haproxy" "${PROJECT_NAME}-web" "${PROJECT_NAME}-service" "${PROJECT_NAME}-db"; do
  if podman container exists "$name"; then
    podman stop "$name" >/dev/null || true
    echo "[down] $name 已停止"
  fi
done

echo "[down] 所有服务已停止"
