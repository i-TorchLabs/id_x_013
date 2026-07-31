from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncConnection, AsyncSession, async_sessionmaker

from x_models._contracts import PluginInterface


class _Idx009Plugin:
    """id_x_013 插件实现。

    懒加载内部 ``x_models`` 模块，避免主程序加载本插件时立即触发
    可能尚未就绪的 ORM 注册链。
    """

    name = "id_x_013"

    def __init__(self) -> None:
        self._base: Any = None

    @property
    def base(self) -> Any:
        if self._base is None:
            from x_models.id_x_013.src.models.x_models import Base
            self._base = Base
        return self._base

    @property
    def required_extensions(self) -> tuple[str, ...]:
        # 009 模型表仅用基础类型，不依赖 pgcrypto / pgvector。
        return ()

    def set_session_maker(self, maker: async_sessionmaker[AsyncSession]) -> None:
        from x_models.id_x_013.src.models.x_models import set_session_maker
        set_session_maker(maker)

    async def build_tables(self, conn: AsyncConnection) -> None:
        await conn.run_sync(self.base.metadata.create_all)


def load_plugin() -> PluginInterface:
    """返回 id_x_013 插件实例。"""
    return _Idx009Plugin()
