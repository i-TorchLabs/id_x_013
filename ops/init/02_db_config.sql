-- 02_db_config.sql
-- 插入默认数据库连接配置记录
-- 由 db 容器 docker-entrypoint-initdb.d 在首次启动时自动执行（顺序在 01_init.sql 之后）

INSERT INTO db_configs (id, name, host, port, username, password, database, is_default)
VALUES (1, 'default', '10.20.217.87', 15432, 'id_x_013', 'P@ssid_x_013!', 'ex_rating_express', TRUE);
