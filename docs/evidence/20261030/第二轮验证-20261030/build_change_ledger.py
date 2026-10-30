"""Read-only source comparison against the original ZIP and the round-two snapshot."""
from pathlib import Path
import difflib
import hashlib
import json
import os
import zipfile

output = Path(__file__).resolve().parent
workspace = output.parent.parent
project = workspace / "medical-main"
snapshot = output.parent / "第二轮基线-20261030"
ignore = {"node_modules", ".next", ".git", "__pycache__"}
text_suffixes = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".sql", ".css", ".svg", ".txt"}

def included(name):
    return not any(p in ignore for p in Path(name).parts) and not Path(name).name.startswith(".env") and not name.endswith(".tsbuildinfo")

def read_tree(root):
    files = {}
    for directory, dirs, names in os.walk(root):
        dirs[:] = sorted(d for d in dirs if d not in ignore)
        for name in sorted(names):
            file = Path(directory) / name
            relative = file.relative_to(root).as_posix()
            if included(relative) and not (root == snapshot and relative == "manifest.json"):
                files[relative] = file.read_bytes()
    return files

current = read_tree(project)
before_round = read_tree(snapshot)
with zipfile.ZipFile(workspace / "medical-main.zip") as archive:
    originals = {}
    for entry in archive.infolist():
        if entry.is_dir():
            continue
        parts = Path(entry.filename).parts
        assert parts[0] == "medical-main", entry.filename
        relative = Path(*parts[1:]).as_posix()
        assert ".." not in Path(relative).parts
        if included(relative):
            originals[relative] = archive.read(entry)

def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None

def decoded(data):
    return (data or b"").decode("utf-8-sig").replace("\r\n", "\n")

def comparison(old, latest=current):
    records = []
    patch = []
    for name in sorted(set(old) | set(latest)):
        left, right = old.get(name), latest.get(name)
        status = "未修改" if left == right else "新增" if left is None else "删除" if right is None else "修改"
        record = {"path": name, "status": status, "beforeSha256": digest(left), "afterSha256": digest(right)}
        if status != "未修改":
            patch.append(f"diff --git a/{name} b/{name}\n")
            if Path(name).suffix in text_suffixes or Path(name).name in {".gitignore", "LICENSE"}:
                try:
                    lines = list(difflib.unified_diff(decoded(left).splitlines(True), decoded(right).splitlines(True),
                        fromfile=f"a/{name}" if left is not None else "/dev/null",
                        tofile=f"b/{name}" if right is not None else "/dev/null"))
                    for line in lines or ["# 仅 UTF-8 BOM 或换行格式发生变化\n"]:
                        patch.append(line if line.endswith("\n") else line + "\n\\ No newline at end of file\n")
                    record["addedLines"] = sum(s.startswith("+") and not s.startswith("+++") for s in lines)
                    record["removedLines"] = sum(s.startswith("-") and not s.startswith("---") for s in lines)
                except UnicodeDecodeError:
                    patch.append("# 二进制或非 UTF-8 文件，参见 SHA256\n")
            else:
                patch.append("# 二进制文件，参见 SHA256\n")
        records.append(record)
    return records, "".join(patch)

cumulative, full_patch = comparison(originals)
# Public assets were excluded from the source snapshot; prove they still match the original ZIP.
assert {k: v for k, v in current.items() if k.startswith('public/')} == {k: v for k, v in originals.items() if k.startswith('public/')}
round_changes, round_patch = comparison(before_round, {k: v for k, v in current.items() if not k.startswith('public/')})
round_map = {r["path"]: r for r in round_changes}
report = {"date": "2026-10-30", "exclusions": ["node_modules", ".next", ".env* (secrets excluded)", "*.tsbuildinfo"],
    "originalZipFiles": len(originals), "currentFiles": len(current), "cumulative": cumulative, "round2": round_changes}
(output / "file-changes.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
(output / "累计改动.patch").write_text(full_patch, encoding="utf-8")
(output / "本轮改动.patch").write_text(round_patch, encoding="utf-8")

def counts(records):
    return {s: sum(r["status"] == s for r in records) for s in ["修改", "新增", "删除", "未修改"]}

def count_text(records):
    return "，".join(f"{status} {count} 个文件" for status, count in counts(records).items())

lines = ["# 全部文件改动清单（2026-10-30）", "",
    "本清单逐文件对照原始 medical-main.zip 与 2026-10-30 第二轮修改前备份。当前内容为最终磁盘文件，新增代码不替换为示例。", "",
    f"- 累计对照：{count_text(cumulative)}。", f"- 本轮对照：{count_text(round_changes)}。", "",
    "[累计全部增删代码](累计改动.patch) · [仅本轮增删代码](本轮改动.patch) · [SHA256 明细](file-changes.json)", "",
    "补丁中 `+` 表示新增行，`-` 表示删除行，`@@` 标明前后行号；未修改文件没有补丁。", "",
    "排除依赖、构建缓存、临时 SQL 引擎与环境密钥；这些不是业务代码修改。next-env.d.ts 是 Next.js 自动生成的声明文件。未创建或覆盖 .env.local。", "",
    "public/ 资源未放入第二轮源码备份，已逐字节核对与原始 ZIP 全部一致，因此没有将它们误记为本轮新增。", "",
    "完整修复原因和仍需处理的业务事项见 [mackdown.md](../../medical-main/mackdown.md)。", "",
    "| 文件 | 相对原始 ZIP | 本轮 | 累计新增/删除行 |", "| --- | --- | --- | --- |"]
for row in cumulative:
    name = row["path"]
    round_status = round_map.get(name, {}).get("status", "未修改")
    line_count = f"+{row['addedLines']} / -{row['removedLines']}" if "addedLines" in row else "—"
    label = f"**【{row['status']}】**" if row["status"] != "未修改" else "未修改"
    round_label = f"**【本轮{round_status}】**" if round_status != "未修改" else "本轮未修改"
    lines.append(f"| [{name}](../../medical-main/{name}) | {label} | {round_label} | {line_count} |")
(output / "全部改动清单.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
print(json.dumps({"cumulative": counts(cumulative), "round2": counts(round_changes)}, ensure_ascii=False))
