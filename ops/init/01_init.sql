-- PostgreSQL 初始化脚本
-- 由 db 容器 docker-entrypoint-initdb.d 在首次启动时自动执行
--
-- 注意：db_configs 默认行的 password 字段为占位值，部署时请按 .env 中的
-- POSTGRES_PASSWORD 同步修改，否则前端 getDbConfig 拿到的连接串无法连上 db。

-- ============================================
-- 0. 创建数据库 id_x_013（已存在则跳过）
-- ============================================
SELECT 'CREATE DATABASE id_x_013' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'id_x_013')\gexec

\c id_x_013

-- ============================================
-- 1. 用户表 (users)
-- 优先创建，因为其他表依赖此表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(128) NOT NULL UNIQUE,
    phone VARCHAR(20),
    password_hash VARCHAR(256) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 用户表索引
CREATE INDEX IF NOT EXISTS ix_users_email ON users(email);
CREATE INDEX IF NOT EXISTS ix_users_phone ON users(phone);

-- 添加表注释
COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.id IS '用户ID';
COMMENT ON COLUMN users.email IS '邮箱';
COMMENT ON COLUMN users.phone IS '电话号码';
COMMENT ON COLUMN users.password_hash IS '密码哈希';
COMMENT ON COLUMN users.is_active IS '是否激活';
COMMENT ON COLUMN users.created_at IS '创建时间';
COMMENT ON COLUMN users.updated_at IS '更新时间';

-- ============================================
-- 2. 用户令牌表 (user_tokens)
-- 依赖 users 表
-- ============================================
CREATE TABLE IF NOT EXISTS user_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 用户令牌表索引
CREATE INDEX IF NOT EXISTS ix_user_tokens_token ON user_tokens(token);
CREATE INDEX IF NOT EXISTS ix_user_tokens_user_id ON user_tokens(user_id);

-- 添加表注释
COMMENT ON TABLE user_tokens IS '用户令牌表';
COMMENT ON COLUMN user_tokens.id IS 'ID';
COMMENT ON COLUMN user_tokens.user_id IS '用户ID';
COMMENT ON COLUMN user_tokens.token IS '认证令牌';
COMMENT ON COLUMN user_tokens.expires_at IS '过期时间';
COMMENT ON COLUMN user_tokens.created_at IS '创建时间';

-- ============================================
-- 3. 密码重置令牌表 (password_reset_tokens)
-- 依赖 users 表
-- ============================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    token VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 密码重置令牌表索引
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS ix_password_reset_tokens_user_id ON password_reset_tokens(user_id);

-- 添加表注释
COMMENT ON TABLE password_reset_tokens IS '密码重置令牌表';
COMMENT ON COLUMN password_reset_tokens.id IS 'ID';
COMMENT ON COLUMN password_reset_tokens.user_id IS '用户ID';
COMMENT ON COLUMN password_reset_tokens.token IS '重置令牌';
COMMENT ON COLUMN password_reset_tokens.expires_at IS '过期时间';
COMMENT ON COLUMN password_reset_tokens.used IS '是否已使用';
COMMENT ON COLUMN password_reset_tokens.created_at IS '创建时间';

-- ============================================
-- 4. 数据库连接配置表 (db_configs)
-- ============================================
CREATE TABLE IF NOT EXISTS db_configs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    host VARCHAR(256) NOT NULL,
    port INTEGER NOT NULL DEFAULT 5432,
    username VARCHAR(128) NOT NULL,
    password VARCHAR(256) NOT NULL,
    database VARCHAR(128) NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 添加表注释
COMMENT ON TABLE db_configs IS '数据库连接配置表';
COMMENT ON COLUMN db_configs.id IS '配置ID';
COMMENT ON COLUMN db_configs.name IS '配置名称';
COMMENT ON COLUMN db_configs.host IS '主机地址';
COMMENT ON COLUMN db_configs.port IS '端口号';
COMMENT ON COLUMN db_configs.username IS '用户名';
COMMENT ON COLUMN db_configs.password IS '密码';
COMMENT ON COLUMN db_configs.database IS '数据库名称';
COMMENT ON COLUMN db_configs.is_default IS '是否为默认配置';
COMMENT ON COLUMN db_configs.created_at IS '创建时间';

-- 默认数据库连接配置记录已迁移至 02_db_config.sql（种子数据与 DDL 分离）

-- ============================================
-- 触发器：自动更新 users 表的 updated_at 字段
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 删除已存在的触发器（如果有）
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- 创建触发器
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 完成
-- ============================================
-- 执行完成后，数据库表已创建成功
