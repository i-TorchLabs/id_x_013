# -*- coding: utf-8 -*-
"""
XML -> CSV 流式转换（针对 20GB ~ 200GB 级大文件优化）
"""

import csv
import os
import shutil
import sys
import tempfile
import time
import traceback
from concurrent.futures import ProcessPoolExecutor

from lxml import etree

_READ_BUF = 8 << 20   # 8MB 读缓冲
_WRITE_BUF = 4 << 20  # 4MB 写缓冲
_COPY_BUF = 4 << 20   # 合并拷贝缓冲

_ROOT_OPEN = b"<__csv_root__>"
_ROOT_CLOSE = b"</__csv_root__>"

# 部分记录的文本字段可能超过 csv 默认的 128KB 字段上限（本文件 articletext 就会）
try:
    csv.field_size_limit(sys.maxsize)
except OverflowError:  # 个别平台不支持 sys.maxsize
    csv.field_size_limit(2**31 - 1)


# ---------------------------------------------------------------------------
# 基础：流式行迭代
# ---------------------------------------------------------------------------

def _iter_rows(source, target_tag, encoding=None):
    """流式产出每行 dict，并及时释放已解析节点的内存（占用恒定）。"""
    kwargs = dict(events=("end",), tag=target_tag, huge_tree=True)
    if encoding:
        kwargs["encoding"] = encoding
    context = etree.iterparse(source, **kwargs)
    for _, elem in context:
        row = {}
        for child in elem:
            row[child.tag] = child.text
        yield row
        # 释放当前节点及之前的所有兄弟节点
        elem.clear()
        while elem.getprevious() is not None:
            del elem.getparent()[0]


def _write_rows(writer, headers, rows):
    writer.writerows([row.get(h) for h in headers] for row in rows)


def _log_progress(prefix, total, t0):
    print(f"{prefix}已处理 {total:,} 行，耗时 {time.time() - t0:.0f}s", flush=True)


# ---------------------------------------------------------------------------
# 解析 -> 输出
# ---------------------------------------------------------------------------

def _parse_to_csv(source, out_path, target_tag, chunk_size, headers,
                  encoding=None, log_prefix=""):
    """表头已知：直接流式写入目标文件，返回总行数。"""
    t0 = time.time()
    total = 0
    last_log = t0
    buf = []
    with open(out_path, "w", newline="", encoding="utf-8", buffering=_WRITE_BUF) as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for row in _iter_rows(source, target_tag, encoding):
            buf.append(row)
            if len(buf) >= chunk_size:
                _write_rows(writer, headers, buf)
                total += len(buf)
                buf.clear()
                if time.time() - last_log >= 2:
                    _log_progress(log_prefix, total, t0)
                    last_log = time.time()
        if buf:
            _write_rows(writer, headers, buf)
            total += len(buf)
    return total


def _parse_to_chunks(source, target_tag, chunk_size, tmp_dir, name_prefix,
                     encoding=None, log_prefix=""):
    """表头未知：分块写临时 CSV（每块带自己的表头）。

    返回 (块文件列表, 有序表头, 总行数)。
    """
    t0 = time.time()
    total = 0
    last_log = t0
    headers = []
    header_set = set()
    buf = []
    chunk_files = []
    chunk_idx = 0
    for row in _iter_rows(source, target_tag, encoding):
        for key in row:
            if key not in header_set:
                header_set.add(key)
                headers.append(key)
        buf.append(row)
        if len(buf) >= chunk_size:
            path = os.path.join(tmp_dir, f"{name_prefix}_{chunk_idx:05d}.csv")
            with open(path, "w", newline="", encoding="utf-8", buffering=_WRITE_BUF) as f:
                writer = csv.writer(f)
                writer.writerow(headers)
                _write_rows(writer, headers, buf)
            chunk_files.append(path)
            total += len(buf)
            buf.clear()
            chunk_idx += 1
            if time.time() - last_log >= 2:
                _log_progress(log_prefix, total, t0)
                last_log = time.time()
    if buf or not chunk_files:
        path = os.path.join(tmp_dir, f"{name_prefix}_{chunk_idx:05d}.csv")
        with open(path, "w", newline="", encoding="utf-8", buffering=_WRITE_BUF) as f:
            writer = csv.writer(f)
            writer.writerow(headers)
            _write_rows(writer, headers, buf)
        chunk_files.append(path)
        total += len(buf)
    return chunk_files, headers, total


# ---------------------------------------------------------------------------
# 合并
# ---------------------------------------------------------------------------

def _read_header_row(path):
    with open(path, "r", newline="", encoding="utf-8") as f:
        for row in csv.reader(f):
            return row
    return None


def _merge_chunks(chunk_files, final_headers, out_path):
    """把多个带表头的 CSV 块合并成一个文件。

    表头与 final_headers 完全一致的块直接二进制拷贝（快路径，占绝大多数）；
    不一致的块按列名重映射（慢路径，仅“字段出现过晚”的少数块会触发）。
    """
    with open(out_path, "w", newline="", encoding="utf-8", buffering=_WRITE_BUF) as f:
        csv.writer(f).writerow(final_headers)
    for path in chunk_files:
        if _read_header_row(path) == final_headers:
            with open(path, "rb", buffering=_READ_BUF) as fin:
                fin.readline()  # 跳过表头行（XML 标签名不可能含换行，安全）
                with open(out_path, "ab", buffering=_WRITE_BUF) as fout:
                    shutil.copyfileobj(fin, fout, _COPY_BUF)
        else:
            with open(path, "r", newline="", encoding="utf-8") as fin, \
                 open(out_path, "a", newline="", encoding="utf-8",
                      buffering=_WRITE_BUF) as fout:
                reader = csv.reader(fin)
                chunk_header = next(reader, None)
                if chunk_header is None:
                    continue
                pos = {name: i for i, name in enumerate(chunk_header)}
                idx = [pos.get(h) for h in final_headers]
                writer = csv.writer(fout)
                writer.writerows(
                    [row[i] if i is not None and i < len(row) else "" for i in idx]
                    for row in reader
                )


# ---------------------------------------------------------------------------
# 并行：文件切分
# ---------------------------------------------------------------------------

class _SliceReader:
    """把文件的 [start, end) 字节区间包装成合法 XML 文档供 lxml 读取：

    前面补 <__csv_root__>，结尾补 </__csv_root__>，使片段本身 well-formed。
    """

    def __init__(self, path, start, end):
        self._f = open(path, "rb", buffering=_READ_BUF)
        self._f.seek(start)
        self._remaining = max(0, end - start)
        self._pending = bytearray(_ROOT_OPEN)
        self._suffix_done = False

    def read(self, size=-1):
        if size is None or size <= 0:
            size = 1 << 20
        buf = self._pending
        if len(buf) < size:
            if self._remaining > 0:
                want = max(size - len(buf), _READ_BUF)
                data = self._f.read(min(want, self._remaining))
                self._remaining -= len(data)
                buf += data
            if self._remaining <= 0 and not self._suffix_done:
                buf += _ROOT_CLOSE
                self._suffix_done = True
                self._f.close()
        out = bytes(buf[:size])
        del buf[:size]
        return out


def _scan_next(f, needle, valid_next, point):
    """从 point 起找下一个 needle（其后一个字符必须在 valid_next 中），返回绝对偏移。"""
    f.seek(point)
    tail = b""
    base = point  # tail[0] 对应的文件绝对偏移
    keep = len(needle)
    while True:
        block = f.read(_READ_BUF)
        if not block:
            return None
        data = tail + block
        start = 0
        while True:
            i = data.find(needle, start)
            if i < 0:
                break
            j = i + len(needle)
            if j >= len(data):
                break  # needle 可能跨块，留到下一轮
            if data[j] in valid_next:
                return base + i
            start = i + 1
        if len(data) > keep:
            tail = data[-keep:]
            base += len(data) - keep
        else:
            tail = data


def _find_last_close_end(f, size, tag_b, max_window=256 << 20):
    """从文件尾部向前找最后一个 </tag>，返回其 '>' 之后的偏移（避免带上根节点闭合标签）。"""
    needle = b"</" + tag_b
    valid_next = b"> \t\r\n"  # 排除 </tagXxx> 这类同前缀标签（如根节点 </RECORDS>）
    window = 1 << 20
    while window <= max_window:
        off = max(0, size - window)
        f.seek(off)
        data = f.read(size - off)
        i = data.rfind(needle)
        while i >= 0:
            j = i + len(needle)
            if j < len(data) and data[j] in valid_next:
                k = data.find(b">", j)
                return off + k + 1 if k >= 0 else size
            i = data.rfind(needle, 0, i)
        if off == 0:
            break
        window *= 4
    return None


def _compute_ranges(xml_file, target_tag, workers, encoding):
    """把文件按 <target_tag> 起始位置切成 workers 个 [start, end) 区间（互不重叠、完整覆盖）。"""
    tag_b = target_tag.encode(encoding)
    size = os.path.getsize(xml_file)
    starts = []
    with open(xml_file, "rb", buffering=_READ_BUF) as f:
        for i in range(workers):
            point = size * i // workers
            s = _scan_next(f, b"<" + tag_b, b"> \t\r\n/", point)
            if s is None:
                break
            starts.append(s)
        if not starts:
            return None
        last_end = _find_last_close_end(f, size, tag_b)
        if last_end is None:
            last_end = size  # 文件可能被截断，交给解析器报错
    ranges = []
    for i, s in enumerate(starts):
        e = starts[i + 1] if i + 1 < len(starts) else last_end
        ranges.append((s, max(e, s)))
    return ranges


def _worker(task):
    (xml_file, start, end, target_tag, chunk_size, encoding,
     tmp_dir, idx, fixed_headers) = task
    reader = _SliceReader(xml_file, start, end)
    part_path = os.path.join(tmp_dir, f"part_{idx:04d}.csv")
    log_prefix = f"[worker {idx}] "
    if fixed_headers is not None:
        n = _parse_to_csv(reader, part_path, target_tag, chunk_size,
                          fixed_headers, encoding=encoding, log_prefix=log_prefix)
        return part_path, list(fixed_headers), n
    chunks, headers, n = _parse_to_chunks(
        reader, target_tag, chunk_size, tmp_dir, f"w{idx:03d}",
        encoding=encoding, log_prefix=log_prefix)
    _merge_chunks(chunks, headers, part_path)
    for c in chunks:
        os.remove(c)
    return part_path, headers, n


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------

def stream_xml_to_csv(xml_file, csv_file, target_tag="record", chunk_size=100_000,
                      workers=1, headers=None, encoding="utf-8"):
    """
    参数:
        xml_file:    输入 XML 路径
        csv_file:    输出 CSV 路径
        target_tag:  记录级标签名（注意 XML 区分大小写）
        chunk_size:  内存中缓冲的行数阈值（越大越快、越占内存）
        workers:     并行进程数；1 = 单进程（最保守）
        headers:     可选，字段固定时直接指定表头列表，可跳过“分块+合并”，最快
        encoding:    并行模式的文件编码（单进程模式由 XML 声明自动识别）
    """
    t_start = time.time()
    fixed_headers = list(headers) if headers else None
    out_dir = os.path.dirname(os.path.abspath(csv_file))
    tmp_dir = tempfile.mkdtemp(prefix=".xml2csv_tmp_", dir=out_dir)
    total = 0
    try:
        if workers and workers > 1:
            print(f"🔍 正在按 <{target_tag}> 边界把文件切分为 {workers} 片...")
            ranges = _compute_ranges(xml_file, target_tag, workers, encoding)
            if not ranges:
                print(f"⚠️ 警告: 在 XML 中未找到任何 <{target_tag}> 标签，"
                      f"请检查 target_tag 是否正确（注意大小写）！")
                return
            tasks = [
                (xml_file, s, e, target_tag, chunk_size, encoding,
                 tmp_dir, i, fixed_headers)
                for i, (s, e) in enumerate(ranges)
            ]
            parts = []
            with ProcessPoolExecutor(max_workers=workers) as pool:
                for part_path, part_headers, n in pool.map(_worker, tasks):
                    parts.append((part_path, part_headers))
                    total += n
                    print(f"✅ 分片完成: {os.path.basename(part_path)}（{n:,} 行）",
                          flush=True)
            if fixed_headers is not None:
                final_headers = fixed_headers
            else:
                seen = set()
                final_headers = []
                for _, ph in parts:  # 按分片顺序取并集，保持首次出现顺序
                    for h in ph:
                        if h not in seen:
                            seen.add(h)
                            final_headers.append(h)
            print("🧩 正在合并分片...")
            _merge_chunks([p for p, _ in parts], final_headers, csv_file)
        else:
            if fixed_headers is not None:
                total = _parse_to_csv(xml_file, csv_file, target_tag,
                                      chunk_size, fixed_headers)
            else:
                chunks, final_headers, total = _parse_to_chunks(
                    xml_file, target_tag, chunk_size, tmp_dir, "chunk")
                print("🧩 正在合并分块...")
                _merge_chunks(chunks, final_headers, csv_file)

        if total == 0:
            print(f"⚠️ 警告: 在 XML 中未找到任何 <{target_tag}> 标签，"
                  f"请检查 target_tag 是否正确（注意大小写）！")
            return
        elapsed = time.time() - t_start
        size_gb = os.path.getsize(xml_file) / (1 << 30)
        print(f"🎉 转换完成！共 {total:,} 行，耗时 {elapsed:.1f}s "
              f"（{size_gb / max(elapsed, 1e-9):.2f} GB/s）")
    except Exception:
        print("❌ 解析过程中发生错误:")
        traceback.print_exc()
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


# 运行转换
if __name__ == "__main__":
    input_path_file = "/Users/i/Desktop/transform/spcrarticle.xml"
    output_path_file = "/Users/i/Desktop/transform/spcrarticle.csv"

    # 注意：本文件的记录标签是大写 <RECORD>（XML 区分大小写，"record" 匹配不到任何数据）
    # 并行进程数：解析是 CPU 密集型，取 min(8, 核数) 即可；
    # 若 XML 文本/CDATA 中可能出现未转义的 "<RECORD"，请改为 workers=1。
    stream_xml_to_csv(
        input_path_file,
        output_path_file,
        target_tag="RECORD",
        chunk_size=100_000,
        workers=min(8, os.cpu_count() or 1),
        # headers=["articleid", "articletext", "pacvertofeedpop"],  # 字段固定时指定可更快
    )
