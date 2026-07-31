# id_x_013 前端镜像（Next.js + Node.js runtime）。
#
# 构建上下文为 x_models/id_x_013/web：
#   podman build -t id_x_013-web -f x_models/id_x_013/web/Dockerfile x_models/id_x_013/web
#
# 运行时端口 2000（由 next start 通过 PORT 环境变量决定），
# haproxy 在同 Pod 内通过 127.0.0.1:2000 访问。

# --------------------------- 构建阶段 ---------------------------
FROM node:24-alpine AS build

WORKDIR /app

# 先安装 cnpm，再通过 cnpm 安装依赖
COPY package.json ./
RUN npm install -g cnpm --registry=https://registry.npmmirror.com \
    && cnpm install --registry=https://registry.npmmirror.com

# 再拷贝源码（含 .env.local，Next.js 构建时自动加载 NEXT_PUBLIC_* 变量）
COPY . .

RUN npm run build

# --------------------------- 运行阶段 ---------------------------
FROM node:24-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=2000 \
    HOSTNAME=0.0.0.0

# 拷贝构建产物与运行时所需文件
COPY --from=build /app/package.json ./

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./
COPY --from=build /app/postcss.config.mjs ./
COPY --from=build /app/tsconfig.json ./

EXPOSE 2000
CMD ["npm", "start"]
