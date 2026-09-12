"""XML 数据解析模块（面向记录型 XML：<ROOT><RECORD><field>…</field></RECORD></ROOT>）。

lxml.iterparse 流式解析，内存占用恒定为单条记录；
记录级标签自动检测（支持 <ROOT><RECORD>...</RECORD></ROOT> 嵌套结构），
也允许调用方显式传入以跳过检测。
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Dict, Iterator, List, Optional

from lxml import etree

if TYPE_CHECKING:
    import pandas as pd

# detect_record_tag 扫描的起始事件数上限（覆盖常见记录结构即停）
RECORD_TAG_DETECT_NODES: int = 10_000
# 预览单次构建 DataFrame 的记录数上限
XML_PREVIEW_ROWS: int = 2_000


# ------------------------------------------------------------------
# 标签工具
# ------------------------------------------------------------------


def _local_name(tag: object) -> str:
    """去除 XML 命名空间前缀，返回纯标签名；非法类型返回空字符串。"""
    if not isinstance(tag, str):
        return ""
    return tag.rsplit("}", 1)[-1] if tag.startswith("{") else tag


# ------------------------------------------------------------------
# 记录级标签检测
# ------------------------------------------------------------------


def detect_record_tag(source, max_nodes: int = RECORD_TAG_DETECT_NODES) -> Optional[str]:
    """自动检测记录级标签名（标签名区分大小写）。

    判定规则（按优先级）：

    1. 根元素下**重复出现且含子元素**的容器标签 → 记录分组
       （如 ``<ROOT><RECORD><field/>…</RECORD></ROOT>``）；
    2. 根元素下重复出现的直接子节点（扁平结构） → 记录节点
       （如 ``<ROOT><rec/><rec/></ROOT>``）；
    3. 根元素自身 → 整份 XML 即单条记录（字段直接挂根下）。

    ``source`` 支持路径字符串、可读文件对象或 ``io.BytesIO``；
    检测仅扫描文件开头 ``max_nodes`` 个起始+结束事件，不遍历全量数据。
    """
    stack: List[str] = []
    root_tag: Optional[str] = None
    tag_count: Dict[str, int] = {}
    container: set = set()
    max_depth: Dict[str, int] = {}
    root_child_counts: Dict[str, int] = {}
    seen = 0

    for event, elem in etree.iterparse(
        source,
        events=("start", "end"),
        huge_tree=True,
        recover=True,
    ):
        tag = elem.tag
        if not isinstance(tag, str):
            continue
        if event == "start":
            seen += 1
            if seen > max_nodes:
                break
            depth = len(stack)
            if root_tag is None:
                root_tag = tag
            tag_count[tag] = tag_count.get(tag, 0) + 1
            max_depth[tag] = max(max_depth.get(tag, 0), depth)
            if len(stack) == 1:
                root_child_counts[tag] = root_child_counts.get(tag, 0) + 1
            if stack:
                container.add(stack[-1])
            stack.append(tag)
        elif stack:
            stack.pop()

    if root_tag is None:
        return None

    # 优先：根下重复出现的容器（含字段子元素的记录分组）
    candidates = {
        t: c for t, c in tag_count.items() if t != root_tag and t in container
    }
    if candidates:
        return max(candidates, key=lambda t: (candidates[t], max_depth.get(t, 0)))

    # 退化：根下重复出现的直接子节点（扁平结构）
    if root_child_counts:
        best = max(root_child_counts, key=lambda t: (root_child_counts[t], max_depth.get(t, 0)))
        if root_child_counts[best] > 1:
            return best

    # 兜底：根元素自身即唯一记录
    return root_tag


# ------------------------------------------------------------------
# 逐条记录流式迭代
# ------------------------------------------------------------------


def iter_xml_records(source, record_tag: str) -> Iterator[dict]:
    """流式产出每条记录 dict（字段名 -> 文本值），解析后即时释放内存。

    ``record_tag`` 为 ``detect_record_tag`` 返回值或调用方显式指定的标签名；
    ``source`` 支持路径字符串或可读文件对象。
    """
    context = etree.iterparse(
        source,
        events=("end",),
        tag=record_tag,
        huge_tree=True,
        recover=True,
    )
    for _, elem in context:
        if elem is None or not isinstance(elem.tag, str):
            continue
        row: dict = {}
        for child in elem:
            row[_local_name(child.tag)] = child.text
        yield row
        # 释放已处理节点，保持内存恒定
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]


# ------------------------------------------------------------------
# DataFrame 分块迭代（供导入路径使用）
# ------------------------------------------------------------------


def xml_chunks_to_df(
    source, chunk_size: int, record_tag: str
) -> Iterator["pd.DataFrame"]:
    """将 XML 流式切成 DataFrame 块（记录间字段不一致时自动 NaN 对齐）。"""
    import pandas as pd

    buf: List[dict] = []
    for row in iter_xml_records(source, record_tag):
        buf.append(row)
        if len(buf) >= chunk_size:
            yield pd.DataFrame(buf)
            buf = []
    if buf:
        yield pd.DataFrame(buf)


def open_xml_chunks(source, chunk_size: int) -> Iterator["pd.DataFrame"]:
    """自动检测记录标签并返回 DataFrame 分块迭代器（供导入使用）。

    检测后自动将 ``source`` 回退到起始位置（支持 BytesIO）；
    检测失败抛 ``ValueError``。
    """
    record_tag = detect_record_tag(source)
    if hasattr(source, "seek"):
        source.seek(0)
    if record_tag is None:
        raise ValueError("无法在 XML 中识别记录结构（未找到可重复的记录节点）")
    yield from xml_chunks_to_df(source, chunk_size, record_tag)


# ------------------------------------------------------------------
# 预览（供预览路径使用）
# ------------------------------------------------------------------


def xml_preview(
    source, max_rows: int = XML_PREVIEW_ROWS
) -> Optional["pd.DataFrame"]:
    """解析 XML 前若干条记录为单个 DataFrame（供字段预览）。

    返回 ``None`` 表示未检测到有效记录；检测失败抛 ``ValueError``。
    """
    record_tag = detect_record_tag(source)
    if hasattr(source, "seek"):
        source.seek(0)
    if record_tag is None:
        raise ValueError("无法在 XML 中识别记录结构（未找到可重复的记录节点）")
    return next(xml_chunks_to_df(source, max_rows, record_tag), None)
