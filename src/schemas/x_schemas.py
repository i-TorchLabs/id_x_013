from typing import List, Optional

import strawberry


@strawberry.type
class HealthType:
    status: str = strawberry.field(description="状态")
    service: str = strawberry.field(description="服务名称")


@strawberry.input
class LoginInput:
    email: str = strawberry.field(description="邮箱")
    password: str = strawberry.field(description="密码")


@strawberry.input
class RegisterInput:
    email: str = strawberry.field(description="邮箱")
    password: str = strawberry.field(description="密码")
    confirm_password: str = strawberry.field(description="确认密码")
    phone: Optional[str] = strawberry.field(default=None, description="电话号码")


@strawberry.input
class ForgotPasswordInput:
    email: str = strawberry.field(description="邮箱")


@strawberry.type
class UserInfoType:
    id: int = strawberry.field(description="用户ID")
    email: str = strawberry.field(description="邮箱")
    phone: Optional[str] = strawberry.field(default=None, description="电话号码")
    created_at: Optional[str] = strawberry.field(default=None, description="创建时间")


@strawberry.type
class AuthResponseType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    token: Optional[str] = strawberry.field(default=None, description="认证令牌")
    expires_at: Optional[str] = strawberry.field(
        default=None, description="令牌过期时间（ISO格式）"
    )
    user: Optional[UserInfoType] = strawberry.field(
        default=None, description="用户信息"
    )


@strawberry.type
class ForgotPasswordResponseType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    reset_token: Optional[str] = strawberry.field(
        default=None, description="重置令牌（仅用于演示，生产环境应发送邮件）"
    )


# ==========================================
# 数据导入工具相关类型
# ==========================================


@strawberry.type
class FieldInfoType:
    name: str = strawberry.field(description="字段名称")
    dtype: str = strawberry.field(description="字段数据类型（pandas dtype 字符串）")
    sample_values: List[str] = strawberry.field(
        default_factory=list, description="前 3 行样本值（已转为字符串）"
    )


@strawberry.type
class FileUploadResultType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    fields: List[FieldInfoType] = strawberry.field(
        default_factory=list, description="解析出的字段信息列表"
    )


@strawberry.input
class FieldDefInput:
    name: str = strawberry.field(description="字段名称")
    dtype: str = strawberry.field(description="PostgreSQL 数据类型，如 INTEGER/TEXT")
    comment: Optional[str] = strawberry.field(default=None, description="字段注释")


@strawberry.input
class CreateTableInput:
    table_name: str = strawberry.field(description="要创建的表名")
    table_comment: Optional[str] = strawberry.field(
        default=None, description="表注释"
    )
    fields: List[FieldDefInput] = strawberry.field(
        description="字段定义列表"
    )
    host: str = strawberry.field(description="目标 PostgreSQL 主机地址")
    port: int = strawberry.field(description="目标 PostgreSQL 端口")
    username: str = strawberry.field(description="目标 PostgreSQL 用户名")
    password: str = strawberry.field(description="目标 PostgreSQL 密码")
    database: str = strawberry.field(description="目标 PostgreSQL 数据库名")
    file_data: str = strawberry.field(
        description="Base64 编码的文件内容，用于导入数据"
    )
    filename: str = strawberry.field(description="原始文件名，用于判断文件类型")


@strawberry.type
class CreateTableResultType:
    success: bool = strawberry.field(description="是否成功")
    message: str = strawberry.field(description="消息")
    sql: str = strawberry.field(description="实际的建表 SQL 语句")
    rows_imported: int = strawberry.field(description="成功导入的数据行数")


@strawberry.type
class DbConfigType:
    id: int = strawberry.field(description="配置ID")
    name: str = strawberry.field(description="配置名称")
    host: str = strawberry.field(description="主机地址")
    port: int = strawberry.field(description="端口号")
    username: str = strawberry.field(description="用户名")
    password: str = strawberry.field(description="密码")
    database: str = strawberry.field(description="数据库名称")
    is_default: bool = strawberry.field(description="是否为默认配置")
