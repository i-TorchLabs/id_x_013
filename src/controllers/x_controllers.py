"""GraphQL 控制器层（thin resolvers）。

本模块仅承担 **请求路由与流量转发** 职责：
- 以 ``Query`` / ``Mutation`` 暴露 GraphQL 端点签名；
- 每个 resolver 仅做参数透传，委托到 ``src/views/x_views.py`` 的视图函数；
- 不包含任何业务逻辑、不直接操作数据库或第三方库。

业务实现见 ``x_views``，数据契约见 ``x_schemas``，ORM 模型见 ``x_models``。
"""
from typing import Optional

import strawberry

from x_models.id_x_013.src.schemas.x_schemas import (
    AuthResponseType,
    CreateTableInput,
    CreateTableResultType,
    DbConfigType,
    FileUploadResultType,
    ForgotPasswordInput,
    ForgotPasswordResponseType,
    HealthType,
    LoginInput,
    RegisterInput,
)
from x_models.id_x_013.src.views.x_views import (
    view_create_table_and_import,
    view_forgot_password,
    view_get_db_config,
    view_health,
    view_login,
    view_logout,
    view_parse_file,
    view_register,
)


@strawberry.type
class Query:
    @strawberry.field(description="健康检查")
    async def health(self) -> HealthType:
        return await view_health()

    @strawberry.field(description="获取默认数据库连接配置")
    async def get_db_config(self) -> Optional[DbConfigType]:
        return await view_get_db_config()


@strawberry.type
class Mutation:
    @strawberry.mutation(description="用户登录")
    async def login(self, input: LoginInput) -> AuthResponseType:
        return await view_login(input)

    @strawberry.mutation(description="用户注册")
    async def register(self, input: RegisterInput) -> AuthResponseType:
        return await view_register(input)

    @strawberry.mutation(description="忘记密码")
    async def forgot_password(
        self, input: ForgotPasswordInput
    ) -> ForgotPasswordResponseType:
        return await view_forgot_password(input)

    @strawberry.mutation(description="用户登出")
    async def logout(self) -> AuthResponseType:
        return await view_logout()

    @strawberry.mutation(description="解析上传的 Excel/CSV 文件，返回字段信息")
    async def parse_file(
        self, file_data: str, filename: str
    ) -> FileUploadResultType:
        return await view_parse_file(file_data, filename)

    @strawberry.mutation(description="在目标 PostgreSQL 数据库中创建表并导入数据")
    async def create_table_and_import(
        self, input: CreateTableInput
    ) -> CreateTableResultType:
        return await view_create_table_and_import(input)


schema = strawberry.Schema(
    query=Query,
    mutation=Mutation,
)


def register_routers(route_prefix: str):
    """注册 GraphQL 路由，供主程序统一挂载。"""
    from litestar import Router

    from strawberry.litestar import make_graphql_controller

    GraphQLController = make_graphql_controller(
        schema,
        path="/graphql",
    )

    router = Router(
        path=route_prefix,
        route_handlers=[
            GraphQLController,
        ],
    )

    return router
