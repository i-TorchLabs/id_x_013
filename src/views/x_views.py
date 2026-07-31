"""业务视图层（business logic）。

本模块承载 id_x_013 插件全部业务逻辑，控制器层
（``x_controllers.py``）仅作为 GraphQL 请求入口与流量转发，不做任何业务
处理，统一委托到本模块的视图函数。

分层约定：
- 视图函数以 ``view_*`` 命名，签名与对应 GraphQL resolver 一致；
- 视图函数返回 ``x_schemas`` 中定义的 GraphQL 类型实例（或 ``None``）；
- 异常在视图内部捕获并转换为业务响应，控制器层不再做 try/except；
- 日志统一使用引擎层 ``utils.log_util`` 工具，自动带请求 ID。
"""
import base64
import hashlib
import io
import secrets
from datetime import datetime, timedelta
from typing import List, Optional

import pandas as pd
import psycopg2
from sqlalchemy import select

from utils.log_util import get_request_id, logger
from x_models.id_x_013.src.models.x_models import (
    DbConfig,
    PasswordResetToken,
    User,
    UserToken,
    get_session,
)
from x_models.id_x_013.src.schemas.x_schemas import (
    AuthResponseType,
    CreateTableInput,
    CreateTableResultType,
    DbConfigType,
    FieldInfoType,
    FileUploadResultType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    HealthType,
    LoginInput,
    RegisterInput,
    UserInfoType,
)


# ==========================================
# 认证辅助函数
# ==========================================


async def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


async def generate_token() -> str:
    return secrets.token_urlsafe(32)


async def verify_token(token: str) -> Optional[User]:
    if not token:
        return None

    try:
        async with get_session()() as session:
            result = await session.execute(
                select(UserToken).where(UserToken.token == token)
            )
            user_token = result.scalar_one_or_none()

            if user_token is None:
                logger.warning(f"{get_request_id()}令牌不存在: {token[:8]}...")
                return None

            if not user_token.is_valid():
                logger.warning(f"{get_request_id()}令牌已过期: {token[:8]}...")
                return None

            user_result = await session.execute(
                select(User).where(User.id == user_token.user_id)
            )
            user = user_result.scalar_one_or_none()

            return user

    except Exception as e:
        logger.error(f"{get_request_id()}验证令牌失败: {e}", exc_info=True)
        return None


# ==========================================
# Query 视图
# ==========================================


async def view_health() -> HealthType:
    return HealthType(status="ok", service="id_x_013")


async def view_get_db_config() -> Optional[DbConfigType]:
    try:
        async with get_session()() as session:
            # 优先查找默认配置
            result = await session.execute(
                select(DbConfig).where(DbConfig.is_default.is_(True)).limit(1)
            )
            config = result.scalar_one_or_none()

            # 如果没有默认配置，取第一条
            if config is None:
                result = await session.execute(
                    select(DbConfig).limit(1)
                )
                config = result.scalar_one_or_none()

            if config is None:
                return None

            return DbConfigType(
                id=config.id,
                name=config.name,
                host=config.host,
                port=config.port,
                username=config.username,
                password=config.password,
                database=config.database,
                is_default=config.is_default or False,
            )
    except Exception as e:
        logger.error(f"{get_request_id()}获取数据库配置失败: {e}", exc_info=True)
        return None


# ==========================================
# Mutation 视图 —— 认证
# ==========================================


async def view_login(input: LoginInput) -> AuthResponseType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return AuthResponseType(success=False, message="用户不存在")

            password_hash = await hash_password(input.password)
            if user.password_hash != password_hash:
                return AuthResponseType(success=False, message="密码错误")

            if user.is_active is False:
                return AuthResponseType(success=False, message="用户尚未激活")

            token = await generate_token()

            expires_at = datetime.utcnow() + timedelta(hours=24)

            user_token = UserToken(
                user_id=user.id,
                token=token,
                expires_at=expires_at,
            )
            session.add(user_token)
            await session.commit()
            await session.refresh(user)

            return AuthResponseType(
                success=True,
                message="登录成功",
                token=token,
                expires_at=expires_at.isoformat(),
                user=UserInfoType(
                    id=user.id,
                    email=user.email,
                    phone=user.phone,
                    created_at=user.created_at.isoformat()
                    if user.created_at
                    else None,
                ),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}登录失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"登录失败: {str(e)}")


async def view_register(input: RegisterInput) -> AuthResponseType:
    try:
        if input.password != input.confirm_password:
            return AuthResponseType(success=False, message="两次密码输入不一致")

        if len(input.password) < 6:
            return AuthResponseType(success=False, message="密码长度至少6位")

        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            existing_user = result.scalar_one_or_none()

            if existing_user:
                return AuthResponseType(success=False, message="邮箱已被注册")

            password_hash = await hash_password(input.password)
            new_user = User(
                email=input.email,
                password_hash=password_hash,
                phone=input.phone,
                is_active=False,
            )
            session.add(new_user)
            await session.commit()
            await session.refresh(new_user)

            return AuthResponseType(
                success=True,
                message="注册成功，请等待管理员激活账户",
                token=None,
                user=UserInfoType(
                    id=new_user.id,
                    email=new_user.email,
                    phone=new_user.phone,
                    created_at=new_user.created_at.isoformat()
                    if new_user.created_at
                    else None,
                ),
            )

    except Exception as e:
        logger.error(f"{get_request_id()}注册失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"注册失败: {str(e)}")


async def view_forgot_password(
    input: ForgotPasswordInput,
) -> ForgotPasswordResponseType:
    try:
        async with get_session()() as session:
            result = await session.execute(
                select(User).where(User.email == input.email)
            )
            user = result.scalar_one_or_none()

            if user is None:
                return ForgotPasswordResponseType(
                    success=True,
                    message="如果邮箱存在，重置链接已发送",
                )

            old_tokens_result = await session.execute(
                select(PasswordResetToken).where(
                    PasswordResetToken.user_id == user.id,
                    PasswordResetToken.used.is_(False),
                )
            )
            old_tokens = old_tokens_result.scalars().all()
            for old_token in old_tokens:
                old_token.used = True

            reset_token = secrets.token_urlsafe(32)
            expires_at = datetime.utcnow() + timedelta(hours=1)

            new_token = PasswordResetToken(
                user_id=user.id,
                token=reset_token,
                expires_at=expires_at,
            )
            session.add(new_token)
            await session.commit()

            return ForgotPasswordResponseType(
                success=True,
                message="重置令牌已生成，生产环境应发送邮件",
                reset_token=reset_token,
            )

    except Exception as e:
        logger.error(f"{get_request_id()}忘记密码处理失败: {e}", exc_info=True)
        return ForgotPasswordResponseType(
            success=False, message=f"处理失败: {str(e)}"
        )


async def view_logout() -> AuthResponseType:
    try:
        return AuthResponseType(
            success=True,
            message="登出成功",
            token=None,
            user=None,
        )

    except Exception as e:
        logger.error(f"{get_request_id()}登出失败: {e}", exc_info=True)
        return AuthResponseType(success=False, message=f"登出失败: {str(e)}")


# ==========================================
# Mutation 视图 —— 数据导入
# ==========================================


async def view_parse_file(
    file_data: str, filename: str
) -> FileUploadResultType:
    try:
        # 解码 base64 文件内容
        try:
            raw_bytes = base64.b64decode(file_data)
        except Exception as decode_err:
            return FileUploadResultType(
                success=False,
                message=f"Base64 解码失败: {str(decode_err)}",
                fields=[],
            )

        # 根据扩展名选择解析方式
        lower_name = filename.lower()
        try:
            if lower_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(raw_bytes))
            elif lower_name.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(raw_bytes))
            else:
                return FileUploadResultType(
                    success=False,
                    message="不支持的文件类型，仅支持 .csv / .xlsx / .xls",
                    fields=[],
                )
        except Exception as parse_err:
            return FileUploadResultType(
                success=False,
                message=f"文件解析失败: {str(parse_err)}",
                fields=[],
            )

        if df is None or df.empty:
            return FileUploadResultType(
                success=False,
                message="文件为空或无数据",
                fields=[],
            )

        fields_info: List[FieldInfoType] = []
        for col_name in df.columns:
            col_series = df[col_name]
            dtype_str = str(col_series.dtype)
            # 取前 3 行样本值，统一转为字符串
            sample_values = [
                "" if pd.isna(v) else str(v)
                for v in col_series.head(3).tolist()
            ]
            fields_info.append(
                FieldInfoType(
                    name=str(col_name),
                    dtype=dtype_str,
                    sample_values=sample_values,
                )
            )

        logger.info(
            f"{get_request_id()}成功解析文件 {filename}: "
            f"{len(fields_info)} 个字段, {len(df)} 行数据"
        )

        return FileUploadResultType(
            success=True,
            message=f"成功解析文件，共 {len(fields_info)} 个字段",
            fields=fields_info,
        )

    except Exception as e:
        logger.error(f"{get_request_id()}解析文件失败: {e}", exc_info=True)
        return FileUploadResultType(
            success=False, message=f"解析文件失败: {str(e)}", fields=[]
        )


async def view_create_table_and_import(
    input: CreateTableInput,
) -> CreateTableResultType:
    try:
        # 1) 解码文件内容
        try:
            raw_bytes = base64.b64decode(input.file_data)
        except Exception as decode_err:
            return CreateTableResultType(
                success=False,
                message=f"Base64 解码失败: {str(decode_err)}",
                sql="",
                rows_imported=0,
            )

        # 2) 读取为 DataFrame
        lower_name = input.filename.lower()
        try:
            if lower_name.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(raw_bytes))
            elif lower_name.endswith((".xlsx", ".xls")):
                df = pd.read_excel(io.BytesIO(raw_bytes))
            else:
                return CreateTableResultType(
                    success=False,
                    message="不支持的文件类型，仅支持 .csv / .xlsx / .xls",
                    sql="",
                    rows_imported=0,
                )
        except Exception as parse_err:
            return CreateTableResultType(
                success=False,
                message=f"文件解析失败: {str(parse_err)}",
                sql="",
                rows_imported=0,
            )

        if df is None or df.empty:
            return CreateTableResultType(
                success=False,
                message="文件为空或无数据",
                sql="",
                rows_imported=0,
            )

        # 3) 构造建表 SQL（使用用户传入的字段定义）
        quoted_table = f'"{input.table_name}"'
        column_defs: List[str] = []
        for field in input.fields:
            col_def = f'    "{field.name}" {field.dtype.upper()}'
            column_defs.append(col_def)

        create_sql = (
            f"CREATE TABLE IF NOT EXISTS {quoted_table} (\n"
            + ",\n".join(column_defs)
            + "\n);"
        )

        # 表注释 SQL
        comment_sqls: List[str] = []
        if input.table_comment:
            # 转义单引号
            escaped_table_comment = input.table_comment.replace("'", "''")
            comment_sqls.append(
                f"COMMENT ON TABLE {quoted_table} IS '{escaped_table_comment}';"
            )

        # 字段注释 SQL
        for field in input.fields:
            if field.comment:
                escaped_comment = field.comment.replace("'", "''")
                comment_sqls.append(
                    f'COMMENT ON COLUMN {quoted_table}."{field.name}" '
                    f"IS '{escaped_comment}';"
                )

        full_sql = "\n".join([create_sql] + comment_sqls)

        # 4) 连接用户提供的 PostgreSQL 数据库
        conn = None
        cursor = None
        try:
            conn = psycopg2.connect(
                host=input.host,
                port=input.port,
                user=input.username,
                password=input.password,
                dbname=input.database,
            )
            conn.autocommit = False
            cursor = conn.cursor()

            # 执行建表与注释
            cursor.execute(create_sql)
            for stmt in comment_sqls:
                cursor.execute(stmt)

            # 5) 导入数据：通过参数化 INSERT 批量写入
            # 使用用户定义的字段名作为目标列，按字段名从 df 中取值。
            field_names = [f.name for f in input.fields]
            # 构造列名片段和占位符片段
            col_str = ", ".join(f'"{n}"' for n in field_names)
            ph_str = ", ".join(["%s"] * len(field_names))
            insert_sql = (
                f"INSERT INTO {quoted_table} ({col_str}) VALUES ({ph_str})"
            )

            # 取 df 的对应列；若某列在 df 中不存在，则用 None 填充
            rows_to_insert = []
            for _, row in df.iterrows():
                values = []
                for n in field_names:
                    if n in df.columns:
                        v = row[n]
                        # 将 NaN 转为 None 便于 psycopg2 写入 NULL
                        if pd.isna(v):
                            values.append(None)
                        else:
                            # numpy 标量转原生 Python 类型，psycopg2 无法适配 numpy.int64 等
                            values.append(v.item() if hasattr(v, "item") else v)
                    else:
                        values.append(None)
                rows_to_insert.append(tuple(values))

            # 批量执行
            cursor.executemany(insert_sql, rows_to_insert)

            rows_imported = len(rows_to_insert)

            conn.commit()

            logger.info(
                f"{get_request_id()}在 {input.host}:{input.port}/{input.database} "
                f"成功创建表 {input.table_name} 并导入 {rows_imported} 行数据"
            )

            return CreateTableResultType(
                success=True,
                message=f"Table created and {rows_imported} rows imported successfully",
                sql=full_sql,
                rows_imported=rows_imported,
            )

        except Exception as db_err:
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
            logger.error(
                f"{get_request_id()}建表/导入数据库失败: {db_err}",
                exc_info=True,
            )
            return CreateTableResultType(
                success=False,
                message=f"数据库操作失败: {str(db_err)}",
                sql=full_sql,
                rows_imported=0,
            )
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass
            if conn is not None:
                try:
                    conn.close()
                except Exception:
                    pass

    except Exception as e:
        logger.error(
            f"{get_request_id()}创建表并导入数据失败: {e}", exc_info=True
        )
        return CreateTableResultType(
            success=False,
            message=f"处理失败: {str(e)}",
            sql="",
            rows_imported=0,
        )
