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
import asyncio
import hashlib
import io
import itertools
import json
import os
import re
import secrets
import shutil
import tempfile
import threading
import uuid
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
    ChunkUploadResultType,
    CreateTableInput,
    CreateTableResultType,
    DbConfigType,
    FieldInfoType,
    FileUploadResultType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    HealthType,
    ImportJobStatusType,
    ImportJobSubmitType,
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
                # 前端可能只上传文件头部采样，丢弃被截断的最后一行，
                # 并容错处理截断产生的非法 UTF-8 字节
                trimmed = raw_bytes.rsplit(b"\n", 1)[0] if b"\n" in raw_bytes else raw_bytes
                df = pd.read_csv(io.BytesIO(trimmed), encoding_errors="replace")
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


# 分片上传暂存目录（系统临时目录下）
UPLOAD_ROOT = os.path.join(tempfile.gettempdir(), "id_x_013_uploads")
# 大文件 CSV 流式导入的每批行数
CSV_CHUNK_ROWS = 20000


def _sanitize_upload_id(upload_id: str) -> str:
    """仅保留安全字符，防止路径穿越。"""
    return re.sub(r"[^A-Za-z0-9_-]", "", upload_id or "")


async def view_upload_file_chunk(
    upload_id: str,
    chunk_index: int,
    total_chunks: int,
    chunk_data: str,
    filename: str,
) -> ChunkUploadResultType:
    """接收单个文件分片并落盘暂存，供后续合并导入。"""
    try:
        safe_id = _sanitize_upload_id(upload_id)
        if not safe_id:
            return ChunkUploadResultType(
                success=False, message="非法的 upload_id", received_index=-1
            )
        if chunk_index < 0 or total_chunks <= 0 or chunk_index >= total_chunks:
            return ChunkUploadResultType(
                success=False, message="分片序号不合法", received_index=-1
            )
        try:
            raw = base64.b64decode(chunk_data)
        except Exception as decode_err:
            return ChunkUploadResultType(
                success=False,
                message=f"Base64 解码失败: {str(decode_err)}",
                received_index=-1,
            )

        upload_dir = os.path.join(UPLOAD_ROOT, safe_id)
        os.makedirs(upload_dir, exist_ok=True)
        part_path = os.path.join(upload_dir, f"{chunk_index:06d}.part")
        with open(part_path, "wb") as f:
            f.write(raw)
        # 元信息（每次写入保持一致，便于任一分片到达后都能恢复上下文）
        with open(os.path.join(upload_dir, "meta.json"), "w") as f:
            json.dump({"filename": filename, "total_chunks": total_chunks}, f)

        logger.info(
            f"{get_request_id()}接收分片 {safe_id} "
            f"{chunk_index + 1}/{total_chunks} ({len(raw)} bytes)"
        )
        return ChunkUploadResultType(
            success=True, message="分片接收成功", received_index=chunk_index
        )
    except Exception as e:
        logger.error(f"{get_request_id()}接收分片失败: {e}", exc_info=True)
        return ChunkUploadResultType(
            success=False, message=f"接收分片失败: {str(e)}", received_index=-1
        )


def _normalize_cell(v):
    """将单元格值规范化为 psycopg2 可写入的原生类型。

    NaN -> None；numpy 标量 -> Python 原生标量；其余原样返回。
    """
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        # 非标量（如 list/dict）无法用 pd.isna 判断，按原值处理
        pass
    return v.item() if hasattr(v, "item") else v


def _import_chunks_to_pg(all_chunks, input, quoted_table, create_sql, comment_sqls):
    """阻塞式执行：建表 + 批量导入（运行于工作线程）。

    返回 (rows_imported, )。异常向上抛出，由调用方统一捕获回滚。
    """
    conn = None
    cursor = None
    try:
        # connect_timeout 避免目标库不可达时长时间挂起
        conn = psycopg2.connect(
            host=input.host,
            port=input.port,
            user=input.username,
            password=input.password,
            dbname=input.database,
            connect_timeout=10,
        )
        conn.autocommit = False
        cursor = conn.cursor()

        # 执行建表与注释
        cursor.execute(create_sql)
        for stmt in comment_sqls:
            cursor.execute(stmt)

        # 使用用户定义的字段名作为目标列，按字段名从 df 中取值
        field_names = [f.name for f in input.fields]
        col_str = ", ".join(f'"{n}"' for n in field_names)
        ph_str = ", ".join(["%s"] * len(field_names))
        insert_sql = (
            f"INSERT INTO {quoted_table} ({col_str}) VALUES ({ph_str})"
        )

        rows_imported = 0
        for chunk in all_chunks:
            # 仅保留目标列中实际存在的列，缺失列位置后续用 None 填充
            present = [n for n in field_names if n in chunk.columns]
            sub = chunk[present] if present else chunk.iloc[:, 0:0]
            # 向量化转原生 Python 对象，避免 iterrows() 逐行开销
            arr = sub.to_numpy(dtype=object, na_value=None)
            col_pos = {n: i for i, n in enumerate(present)}

            rows_to_insert = []
            for row in arr:
                values = []
                for n in field_names:
                    idx = col_pos.get(n)
                    values.append(
                        _normalize_cell(row[idx]) if idx is not None else None
                    )
                rows_to_insert.append(tuple(values))

            if rows_to_insert:
                cursor.executemany(insert_sql, rows_to_insert)
                rows_imported += len(rows_to_insert)

        conn.commit()
        return rows_imported
    finally:
        if cursor is not None:
            try:
                cursor.close()
            except Exception:
                pass
        if conn is not None:
            try:
                if conn.closed == 0:
                    conn.rollback()
            except Exception:
                pass
            try:
                conn.close()
            except Exception:
                pass


async def view_create_table_and_import(
    input: CreateTableInput,
) -> CreateTableResultType:
    """同步建表导入（小文件/调用方愿意等待的场景）。

    大文件建议改用 view_submit_import_job（后台任务 + 轮询），
    以免受任何一层网关超时限制。
    """
    result = await _run_import_job(input)
    return CreateTableResultType(
        success=result["success"],
        message=result["message"],
        sql=result["sql"],
        rows_imported=result["rows_imported"],
    )


# ==========================================
# 后台导入任务（避免长请求被网关超时切断）
# ==========================================

# 任务状态落盘目录（多 worker 进程间共享：submit 与 status 可能落到不同 worker）
_IMPORT_JOB_DIR = os.path.join(tempfile.gettempdir(), "id_x_013_import_jobs")
os.makedirs(_IMPORT_JOB_DIR, exist_ok=True)
# 任务结果保留时长（秒），过期清理
_IMPORT_JOB_TTL = 3600
_IMPORT_JOBS_LOCK = threading.Lock()


def _job_path(job_id: str) -> str:
    safe = _sanitize_upload_id(job_id)
    return os.path.join(_IMPORT_JOB_DIR, f"{safe}.json")


def _set_job(job_id: str, **fields) -> None:
    """合并写入任务状态（原子写，避免并发读得到半截 JSON）。"""
    with _IMPORT_JOBS_LOCK:
        job = _read_job_unlocked(job_id) or {}
        job.update(fields)
        path = _job_path(job_id)
        tmp = f"{path}.{threading.get_ident()}.tmp"
        try:
            with open(tmp, "w") as f:
                json.dump(job, f, ensure_ascii=False)
            os.replace(tmp, path)
        except Exception as e:
            logger.error(f"写入任务状态失败 {job_id}: {e}")


def _read_job_unlocked(job_id: str) -> Optional[dict]:
    path = _job_path(job_id)
    if not os.path.isfile(path):
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return None


def _get_job(job_id: str) -> Optional[dict]:
    with _IMPORT_JOBS_LOCK:
        return _read_job_unlocked(job_id)


def _gc_jobs() -> None:
    """清理已完成且超过 TTL 的任务文件。"""
    now = datetime.utcnow()
    try:
        for fn in os.listdir(_IMPORT_JOB_DIR):
            if not fn.endswith(".json"):
                continue
            path = os.path.join(_IMPORT_JOB_DIR, fn)
            try:
                with open(path) as f:
                    job = json.load(f)
            except Exception:
                continue
            fin = job.get("_finished_dt")
            if fin:
                try:
                    fin_dt = datetime.fromisoformat(fin)
                except ValueError:
                    continue
                if (now - fin_dt).total_seconds() > _IMPORT_JOB_TTL:
                    os.remove(path)
    except Exception:
        pass


async def view_submit_import_job(
    input: CreateTableInput,
) -> ImportJobSubmitType:
    """受理建表导入请求并立即返回 job_id，后台线程执行导入。

    前端随后以 job_id 轮询 view_import_job_status，彻底避开网关超时。
    """
    try:
        job_id = uuid.uuid4().hex
        _gc_jobs()
        _set_job(
            job_id,
            status="pending",
            message="任务已受理，排队执行中",
            rows_imported=0,
            sql="",
            created_at=datetime.utcnow().isoformat(),
            finished_at=None,
            _finished_dt=None,
        )

        def _thread_main() -> None:
            # 独立线程 + 独立事件循环，与请求生命周期完全解耦，
            # 即使提交后客户端断开连接，导入也会继续执行。
            _set_job(job_id, status="running", message="导入中")
            try:
                result = asyncio.run(_run_import_job(input))
                _set_job(
                    job_id,
                    status="success" if result["success"] else "failed",
                    message=result["message"],
                    rows_imported=result["rows_imported"],
                    sql=result["sql"],
                    finished_at=datetime.utcnow().isoformat(),
                    _finished_dt=datetime.utcnow().isoformat(),
                )
            except Exception as run_err:
                logger.error(
                    f"导入任务 {job_id} 执行异常: {run_err}", exc_info=True
                )
                _set_job(
                    job_id,
                    status="failed",
                    message=f"执行异常: {str(run_err)}",
                    finished_at=datetime.utcnow().isoformat(),
                    _finished_dt=datetime.utcnow().isoformat(),
                )

        # 后台守护线程执行，不阻塞当前 HTTP 请求
        threading.Thread(
            target=_thread_main, name=f"import-job-{job_id[:8]}", daemon=True
        ).start()
        logger.info(f"{get_request_id()}受理导入任务 {job_id}（表 {input.table_name}）")
        return ImportJobSubmitType(
            success=True, message="导入任务已受理", job_id=job_id
        )
    except Exception as e:
        logger.error(f"{get_request_id()}受理导入任务失败: {e}", exc_info=True)
        return ImportJobSubmitType(
            success=False, message=f"受理失败: {str(e)}", job_id=None
        )


async def view_import_job_status(job_id: str) -> ImportJobStatusType:
    job = _get_job(job_id)
    if job is None:
        return ImportJobStatusType(
            job_id=job_id,
            status="failed",
            message="任务不存在或已过期",
            rows_imported=0,
            sql="",
            created_at="",
            finished_at=None,
        )
    return ImportJobStatusType(
        job_id=job_id,
        status=job.get("status", "pending"),
        message=job.get("message", ""),
        rows_imported=job.get("rows_imported", 0),
        sql=job.get("sql", ""),
        created_at=job.get("created_at", ""),
        finished_at=job.get("finished_at"),
    )


async def _run_import_job(input: CreateTableInput) -> dict:
    """执行建表 + 导入的完整流程（与具体 GraphQL 类型解耦，便于后台复用）。

    返回 dict: {success, message, sql, rows_imported}
    """
    upload_dir: Optional[str] = None
    try:
        # 1) 获取数据源：优先 upload_id（分片合并后的本地文件），否则 base64
        source: object
        lower_name = input.filename.lower()
        if input.upload_id:
            safe_id = _sanitize_upload_id(input.upload_id)
            upload_dir = (
                os.path.join(UPLOAD_ROOT, safe_id) if safe_id else None
            )
            if not upload_dir:
                return {"success": False, "message": "非法的 upload_id", "sql": "", "rows_imported": 0}
            meta_path = os.path.join(upload_dir, "meta.json")
            if not os.path.isfile(meta_path):
                return {"success": False, "message": "分片上传不存在或已过期，请重新上传文件", "sql": "", "rows_imported": 0}
            with open(meta_path) as mf:
                meta = json.load(mf)
            lower_name = str(meta.get("filename") or input.filename).lower()
            total = int(meta.get("total_chunks") or 0)
            parts = [
                os.path.join(upload_dir, f"{i:06d}.part")
                for i in range(total)
            ]
            if total <= 0 or any(not os.path.isfile(p) for p in parts):
                return {"success": False, "message": "分片不完整，请重新上传文件", "sql": "", "rows_imported": 0}
            merged_path = os.path.join(upload_dir, "merged.bin")
            with open(merged_path, "wb") as out:
                for p in parts:
                    with open(p, "rb") as pf:
                        shutil.copyfileobj(pf, out)
            source = merged_path
        elif input.file_data:
            try:
                raw_bytes = base64.b64decode(input.file_data)
            except Exception as decode_err:
                return {"success": False, "message": f"Base64 解码失败: {str(decode_err)}", "sql": "", "rows_imported": 0}
            source = io.BytesIO(raw_bytes)
        else:
            return {"success": False, "message": "缺少文件数据（file_data 或 upload_id 必传其一）", "sql": "", "rows_imported": 0}

        # 2) 构造数据块迭代器（大文件 CSV 流式读取，避免全量载入内存）
        try:
            if lower_name.endswith(".csv"):
                chunk_iter = pd.read_csv(source, chunksize=CSV_CHUNK_ROWS)
            elif lower_name.endswith((".xlsx", ".xls")):
                chunk_iter = iter([pd.read_excel(source)])
            else:
                return {"success": False, "message": "不支持的文件类型，仅支持 .csv / .xlsx / .xls", "sql": "", "rows_imported": 0}
            chunk_iter = iter(chunk_iter)
            first_chunk = next(chunk_iter, None)
        except Exception as parse_err:
            return {"success": False, "message": f"文件解析失败: {str(parse_err)}", "sql": "", "rows_imported": 0}

        if first_chunk is None or first_chunk.empty:
            return {"success": False, "message": "文件为空或无数据", "sql": "", "rows_imported": 0}

        all_chunks = itertools.chain([first_chunk], chunk_iter)

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

        # 4) 连接用户提供的 PostgreSQL 数据库并导入（阻塞操作，放入工作线程，
        #    避免长时间占用事件循环；线程内完成建表 + 批量 INSERT）
        try:
            rows_imported = await asyncio.to_thread(
                _import_chunks_to_pg,
                all_chunks,
                input,
                quoted_table,
                create_sql,
                comment_sqls,
            )

            logger.info(
                f"{get_request_id()}在 {input.host}:{input.port}/{input.database} "
                f"成功创建表 {input.table_name} 并导入 {rows_imported} 行数据"
            )

            return {"success": True, "message": f"Table created and {rows_imported} rows imported successfully", "sql": full_sql, "rows_imported": rows_imported}

        except Exception as db_err:
            logger.error(
                f"{get_request_id()}建表/导入数据库失败: {db_err}",
                exc_info=True,
            )
            return {"success": False, "message": f"数据库操作失败: {str(db_err)}", "sql": full_sql, "rows_imported": 0}

    except Exception as e:
        logger.error(
            f"{get_request_id()}创建表并导入数据失败: {e}", exc_info=True
        )
        return {"success": False, "message": f"处理失败: {str(e)}", "sql": "", "rows_imported": 0}
    finally:
        # 清理分片暂存目录
        if upload_dir:
            try:
                shutil.rmtree(upload_dir, ignore_errors=True)
            except Exception:
                pass
