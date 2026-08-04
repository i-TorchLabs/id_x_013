<div align="center">

# id_x_013: 数据导入工作台

**面向科研数据资产的 Excel/CSV 解析与 PostgreSQL 自动建表导入组件**

![编号](https://img.shields.io/static/v1?label=编号&message=013&color=lightgray&style=flat-square&labelColor=black)
![协议](https://img.shields.io/static/v1?label=协议&message=AGPL-3.0&color=lightgray&style=flat-square&labelColor=black)
![作者](https://img.shields.io/static/v1?label=作者&message=Ray&color=lightgray&style=flat-square&labelColor=black)
![组织](https://img.shields.io/static/v1?label=组织&message=TorchLabs&color=lightgray&style=flat-square&labelColor=black)
![引擎](https://img.shields.io/static/v1?label=引擎&message=Litestar%20%2B%20Granian&color=lightgray&style=flat-square&labelColor=black)
![语言](https://img.shields.io/static/v1?label=语言&message=Python%20%2B%20TypeScript&color=lightgray&style=flat-square&labelColor=black)
![数据库](https://img.shields.io/static/v1?label=数据库&message=PostgreSQL&color=lightgray&style=flat-square&labelColor=black)

</div>

---

## 1 简介

**Slogan**：面向科研数据资产的 Excel/CSV 解析与 PostgreSQL 自动建表导入插件。

id_x_013 是 TorchLabs/i-Torch 主程序的业务插件，定位为「上传即入库」的数据导入工作台。插件通过插件接口（Plugin Interface）契约挂载到主程序，对外暴露图查询语言（Graph Query Language, GraphQL）端点，对内遵循「控制器薄转发 → 视图承载业务 → 模型固化数据 → 模式声明契约」四层分层，覆盖用户登录、文件解析、目标库连接、自动建表、批量导入与表/字段注释生成的完整链路。

针对科研数据汇集中的「Excel/CSV 字段人工建表烦琐、字段类型易错、导入脚本难复用、多目标库无统一入口」等痛点，id_x_013 以 pandas 推断字段样本、用户自定义 PostgreSQL 类型、参数化 `executemany` 批量写入、单事务回滚给出可复现方案，相较手工 `COPY` 或独立脚本式方案具备更强的字段校验闭环与目标库可插拔能力，适用于实验数据归档、问卷批次入库、多库归集等场景。

## 2 核心特性

- GraphQL 端点：基于 Strawberry 暴露查询（Query）/变更（Mutation）两类操作，统一前缀 `/b/id_x_013/graphql`，受主程序 Bearer 鉴权保护。
- 文件解析：基于 pandas 解析 CSV、XLSX、XLS 三类文件，返回字段名称、字段数据类型（dtype）与前 3 行样本值，供前端预校验。
- 自动建表与导入：依据用户传入的字段名与类型生成 `CREATE TABLE IF NOT EXISTS` 语句，附带表注释与字段注释；通过参数化 `executemany` 批量入库，导入异常时事务回滚。
- 目标库可插拔：导入接口内嵌主机、端口、用户名、密码、数据库名五项参数，单次请求即可指向任意可达 PostgreSQL 实例，与主程序业务库物理隔离。
- 容器化四件套：提供 `podman-compose.yml` 以四容器同 Pod 部署（数据库 / 服务 / 前端 / 反向代理），Pod 内容器共享网络命名空间，仅反向代理暴露宿主机端口。

## 3 项目亮点

1. **薄控制器分层** —— 控制器（x_controllers.py）仅做参数透传，业务逻辑全部下沉至视图（x_views.py），四层（控制器/视图/模型/模式）职责单一，便于单元测试与替换。
2. **字段样本先行** —— `view_parse_file` 先解码 Base64 再按扩展名分流解析，输出字段 dtype 与前 3 行样本，前端可在导入前完成类型映射校对，避免脏数据落库。
3. **类型由用户定义** —— `CreateTableInput.fields` 强制要求每字段给出 PostgreSQL 类型与可选注释，类型一律大写后写入 SQL，杜绝 panda dtype 与数据库类型错配。
4. **单事务回滚闭环** —— 建表、注释、批量 INSERT 共用同一 psycopg2 连接，任意步异常即 `rollback()` 并返回已生成的 SQL 供排错，最终 `finally` 关闭游标与连接。
5. **NaN 与 numpy 适配** —— 导入前逐值判 `pd.isna` 转 `None` 写 NULL，并通过 `v.item()` 将 numpy 标量转为原生 Python 类型，规避 psycopg2 无法适配 numpy.int64 等异常。
6. **同 Pod 共享网络** —— Podman 四容器同 Pod 共享网络命名空间，数据库/服务/前端/反向代理通过 `127.0.0.1` 互访，仅反向代理 `:8080` 经 Pod 端口映射暴露，外部攻击面最小化。
7. **配置表回退默认** —— `view_get_db_config` 优先查 `db_configs` 表 `is_default` 行，无默认则回退首行，前端无显式连接参数时仍可取到可用配置。

## 4 技术栈

表 4-1 id_x_013 技术栈一览

| 分类 | 名称 | 版本 | 用途 |
|---|---|---|---|
| 编程语言 | Python | ≥ 3.10 | 服务端主语言 |
| 编程语言 | TypeScript | ≥ 5.0 | 前端主语言 |
| 后端框架 | Litestar | ≥ 2.24 | ASGI 路由与中间件宿主 |
| 应用服务器 | Granian | — | Rust 内核 ASGI 服务器 |
| 接口协议 | Strawberry GraphQL | ≥ 0.323 | 查询/变更两类操作 |
| 数据库 | PostgreSQL | 18 | 业务库与导入目标库 |
| 同步驱动 | psycopg2 | ≥ 2.9 | 目标库建表与批量导入 |
| 异步驱动 | asyncpg + SQLAlchemy | ≥ 2.0 | 业务库异步会话 |
| 数据解析 | pandas + openpyxl | — | CSV/XLSX/XLS 解析 |
| 前端框架 | Next.js | 16.2.3 | React 服务端渲染 |
| UI 组件 | HeroUI + Tailwind CSS | ^3.2 / ^4 | 组件库与样式 |
| 反向代理 | HAProxy | 3.0 | SSL 终止与路由分区 |
| 容器编排 | Podman Compose | — | 四容器同 Pod 部署 |

## 5 整体架构图

```mermaid
graph TB
  subgraph L1[表示层 web 前端]
    Browser[浏览器]
    NextJS["Next.js<br/>React + HeroUI"]
  end

  subgraph L2[网关层 反向代理]
    HAProxy[HAProxy<br/>/: 前端 /b/id_x_013/: 后端]
  end

  subgraph L3[接入层 主程序 i-Torch]
    Granian[Granian ASGI Server]
    MW[RequestMiddleware<br/>鉴权 / 请求ID]
    Adapt["src/adapt.py 适配"]
  end

  subgraph L4[插件层 id_x_013 控制器]
    GQL[Strawberry GraphQL<br/>Query/Mutation]
  end

  subgraph L5[业务层 视图]
    Auth[认证视图<br/>登录/注册/重置]
    Parse[文件解析视图<br/>pandas dtype + 样本]
    Import[建表导入视图<br/>psycopg2 同步连接]
  end

  subgraph L6[数据层]
    BizDB[(业务库<br/>users/db_configs)]
    TargetDB[(目标库<br/>自定义 PG 实例)]
  end

  subgraph L7[外部依赖]
    Client[用户上传文件<br/>CSV/XLSX/XLS]
  end

  Browser --> NextJS
  NextJS -->|HTTP| HAProxy
  HAProxy -->|/b/id_x_013/*| Granian
  Granian --> MW
  MW --> Adapt
  Adapt --> GQL
  GQL --> Auth
  GQL --> Parse
  GQL --> Import
  Auth --> BizDB
  Parse --> Client
  Import -->|CREATE + INSERT| TargetDB
  Import -.->|读取连接参数| BizDB
```

图 5-1 id_x_013 分层架构图

## 6 请求流转图

```mermaid
sequenceDiagram
  participant C as Client
  participant H as HAProxy
  participant M as Granian + Middleware
  participant G as GraphQL Controller
  participant V as View
  participant Biz as 业务库
  participant T as 目标库

  C->>H: POST /b/id_x_013/graphql (createTableAndImport)
  H->>M: 路由 /b/* 转发
  M->>G: 鉴权通过，进入 GraphQL
  G->>V: view_create_table_and_import(input)

  V->>V: Base64 解码文件
  alt 解码失败
    V-->>G: success=false Base64 解码失败
  else 解码成功
    V->>V: 按扩展名 pandas 解析

    alt 不支持的类型
      V-->>G: success=false 仅支持 csv/xlsx/xls
    else 解析成功
      V->>V: 构造 CREATE TABLE + 字段注释 SQL
      V->>T: psycopg2.connect(input.host/port/...)
      T-->>V: 连接对象

      V->>T: 执行 CREATE TABLE + COMMENT
      V->>T: executemany 参数化 INSERT
      T-->>V: 写入结果

      alt 任意步异常
        V->>T: rollback()
        V-->>G: success=false message=数据库操作失败 sql=...
      else 全部成功
        V->>T: commit()
        T-->>V: 提交完成
        V-->>G: success=true rows_imported=N sql=...
      end
    end
  end

  G-->>M: 返回结果
  M-->>C: 最终响应
```

图 6-1 id_x_013 请求流转图

## 7 目录结构

```text
id_x_013/
├── x_plugin.py                 # 插件入口: load_plugin() 返回插件实例
├── requirements.txt            # Python 依赖清单
├── LICENSE                     # AGPL-3.0 许可证
├── src/
│   ├── controllers/
│   │   └── x_controllers.py    # Strawberry Query/Mutation + register_routers
│   ├── views/
│   │   └── x_views.py          # 业务逻辑: 认证/文件解析/建表导入
│   ├── models/
│   │   └── x_models.py         # SQLAlchemy ORM: User/UserToken/DbConfig 等
│   └── schemas/
│       └── x_schemas.py        # Strawberry 类型: LoginInput/CreateTableInput 等
├── web/                        # Next.js 前端
│   ├── package.json            # next 16.2.3 / react 19.2.4 / HeroUI
│   ├── next.config.ts          # Next.js 配置
│   ├── tsconfig.json           # TypeScript 配置
│   ├── Dockerfile              # 前端镜像构建
│   ├── src/                    # 前端源码
│   └── public/                 # 静态资源
├── ops/
│   ├── podman-compose.yml      # 四容器同 Pod 编排
│   ├── up.sh / down.sh         # Pod 创建/销毁脚本
│   ├── Dockerfile.service      # 后端镜像构建
│   ├── haproxy.cfg             # HAProxy 路由配置
│   ├── .env.example            # 环境变量模板
│   └── init/                   # PostgreSQL 初始化脚本
│       ├── 01_init.sql         # 建库与基础表
│       └── 02_db_config.sql    # 默认数据库配置行
└── docs/
    └── .gitkeep                # 文档目录占位
```

## 8 API 接口文档

id_x_013 对外接口由 `register_routers` 统一注册至主程序 `/b/id_x_013` 前缀下，受主程序 `RequestMiddleware` 的 Bearer 鉴权保护（豁免路径除外）。下表汇总主要端点，详细字段以 Strawberry Schema 为准。

表 8-1 接口汇总

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/b/id_x_013/graphql` | Bearer | GraphQL 查询/变更主入口 |

### 8.1 GraphQL 查询 (Query)

- `health`：健康检查，返回 `{ status: "ok", service: "id_x_013" }`。
- `getDbConfig`：获取默认数据库连接配置，优先取 `db_configs` 表 `is_default` 行，无默认则回退首行。

### 8.2 GraphQL 变更 (Mutation)

- `login(input: LoginInput!)`：用户登录，校验密码哈希后签发令牌入库 `user_tokens`，24 小时过期，返回 `AuthResponseType`。
- `register(input: RegisterInput!)`：用户注册，两次密码一致性校验，邮箱去重，默认 `is_active=False` 待管理员激活。
- `forgotPassword(input: ForgotPasswordInput!)`：忘记密码，旧令牌置 `used=True` 后签发 1 小时令牌。
- `logout`：登出，返回成功响应。
- `parseFile(fileData: String!, filename: String!)`：解析上传文件，Base64 解码后按扩展名分流至 pandas，返回字段名称/dtype/前 3 行样本，仅接受 `.csv`/`.xlsx`/`.xls`。
- `createTableAndImport(input: CreateTableInput!)`：在目标 PostgreSQL 实例建表并导入数据。`CreateTableInput` 含 `table_name`、`table_comment`、`fields`（每字段含 `name`/`dtype`/`comment`）、目标库连接五参、`file_data`（Base64 编码文件）、`filename`。返回 `CreateTableResultType{ success, message, sql, rows_imported }`。

### 8.3 调用示例

以下示例需替换占位符 `<BASE_URL>`、`<TOKEN>`、`<DB_HOST>` 等。

```bash
# 健康检查
curl -X POST "<BASE_URL>/b/id_x_013/graphql" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "query": "{ health { status service } }" }'

# 解析文件（file_data 需先 Base64 编码）
curl -X POST "<BASE_URL>/b/id_x_013/graphql" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($f: String!, $n: String!) { parseFile(fileData: $f, filename: $n) { success message fields { name dtype sampleValues } } }",
    "variables": { "f": "<BASE64_DATA>", "n": "sample.xlsx" }
  }'

# 建表并导入
curl -X POST "<BASE_URL>/b/id_x_013/graphql" \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($i: CreateTableInput!) { createTableAndImport(input: $i) { success message sql rowsImported } }",
    "variables": {
      "i": {
        "tableName": "experiment_01",
        "tableComment": "实验一批次数据",
        "fields": [
          { "name": "id", "dtype": "INTEGER", "comment": "记录编号" },
          { "name": "value", "dtype": "REAL", "comment": "测量值" }
        ],
        "host": "<DB_HOST>",
        "port": 5432,
        "username": "<DB_USER>",
        "password": "<DB_PASSWORD>",
        "database": "<DB_NAME>",
        "fileData": "<BASE64_DATA>",
        "filename": "sample.csv"
      }
    }
  }'
```

未携带合法 Bearer Token 时由主程序中间件返回：

```json
{"error": "Unauthorized access", "code": 401}
```

请求体大小上限由主程序 `[BASE].MAX_REQUEST_BODY_SIZE` 控制，默认 1 073 741 824 字节（1 GiB），满足 Base64 编码大文件上传需求。

## 9 快速部署

### 9.1 环境准备

- Python ≥ 3.10（推荐 3.10）
- Node.js ≥ 24（前端构建，Next.js 16 建议 Node 24+）
- PostgreSQL ≥ 14（业务库，已默认采用 18）
- 主程序 i-Torch 已就绪
- Podman 与 podman-compose（容器化部署）

### 9.2 安装

```bash
# 在主程序 x_models/ 下放置插件
cp -r id_x_013 <ID_X_000>/x_models/

# 安装 Python 依赖（建议使用主程序虚拟环境）
pip install -r x_models/id_x_013/requirements.txt

# 前端依赖
cd x_models/id_x_013/web
cnpm install
```

在主程序 `config/base_config.toml` 注册插件：

```toml
[EXTEND]
MODELS = [
    ["id_x_013", "/id_x_013"],
]
```

### 9.3 配置

业务库初始化由 `ops/init/01_init.sql` 自动执行，如手动初始化：

```bash
psql -h 127.0.0.1 -p 5432 -U postgres \
  -f x_models/id_x_013/ops/init/01_init.sql
```

复制环境变量模板并填入凭据：

```bash
cp x_models/id_x_013/ops/.env.example x_models/id_x_013/ops/.env
# 编辑 .env，填入 POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD 等
```

前端环境变量写入 `web/.env.local`，至少包含 `NEXT_PUBLIC_BASE_URL` 与 `NEXT_PUBLIC_SUB_VERSION`。

### 9.4 运行

```bash
# 启动后端（在主程序根目录）
python main.py

# 启动前端
cd x_models/id_x_013/web
cnpm run dev      # 开发模式，默认 2000 端口
# 或
cnpm run build && cnpm run start   # 生产模式
```

后端默认监听主程序配置端口（如 `0.0.0.0:7000`），前端 Next.js 默认监听 `2000`。生产环境通过 HAProxy 将 `/b/id_x_013/*` 路由到后端、其余路由到前端，配置见 `ops/haproxy.cfg`。

### 9.5 容器部署

项目内置 Podman 四容器同 Pod 编排，部署命令如下：

```bash
cd x_models/id_x_013/ops

# 创建 Pod 并启动四容器（数据库 / 服务 / 前端 / 反向代理）
./up.sh
# 等价于：
# podman pod create --name id_x_013 -p 8085:8080
# podman-compose -f podman-compose.yml up -d --build

# 查看状态
podman pod ps
podman logs -f id_x_013-haproxy

# 销毁 Pod 与容器
./down.sh
```

宿主机访问 `http://<HOST>:8085` 即可，HAProxy 监听 Pod 内 `:8080`，经 Pod 端口映射暴露到宿主机 `8085`。若使用 Kubernetes，可参考以下方式部署：

```bash
kubectl apply -f ops/deployment.yaml
kubectl rollout status deployment/id_x_013
```

部署清单需自行补全数据库连接 Secret、持久卷挂载与 `.env` 的 ConfigMap 映射。

---

## 参考文献

- [1] Strawberry GraphQL. Strawberry Framework Documentation[EB/OL]. https://strawberry.rocks, 2025.
- [2] Litestar Project. Litestar Framework Documentation[EB/OL]. https://docs.litestar.dev, 2025.
- [3] pandas development team. pandas Documentation[EB/OL]. https://pandas.pydata.org/docs, 2025.
- [4] Vercel. Next.js Documentation[EB/OL]. https://nextjs.org/docs, 2025.
- [5] PostgreSQL Global Development Group. PostgreSQL Documentation[EB/OL]. https://www.postgresql.org/docs, 2025.
