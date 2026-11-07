"""Relatório em Markdown."""

from __future__ import annotations


def _cell(value: object) -> str:
    return str(value).replace("|", "\\|").replace("\n", " ")


def to_markdown(result: dict) -> str:
    lines: list[str] = [
        f"# RepoScope — {result['path']}",
        "",
        f"- Arquivos: {result['files']}",
        f"- Linhas: {result['total_lines']}",
        f"- Marcas: {len(result['todos'])}",
        "",
        "## Linhas por linguagem",
        "",
        "| Linguagem | Arquivos | Linhas |",
        "| --- | ---: | ---: |",
    ]
    for row in result["by_language"]:
        lines.append(
            f"| {_cell(row['language'])} | {row['files']} | {row['lines']} |"
        )
    if not result["by_language"]:
        lines.append("| — | 0 | 0 |")

    lines.extend(["", "## Maiores arquivos", "", "| Arquivo | Bytes | Linhas |", "| --- | ---: | ---: |"])
    for row in result["largest"]:
        lines.append(f"| {_cell(row['path'])} | {row['bytes']} | {row['lines']} |")
    if not result["largest"]:
        lines.append("| — | 0 | 0 |")

    lines.extend(
        [
            "",
            "## TODO, FIXME e HACK",
            "",
            "| Arquivo | Linha | Tipo | Texto |",
            "| --- | ---: | --- | --- |",
        ]
    )
    for row in result["todos"]:
        lines.append(
            f"| {_cell(row['path'])} | {row['line']} | {row['kind']} | {_cell(row['text'])} |"
        )
    if not result["todos"]:
        lines.append("| — | 0 | — | nenhuma marca |")

    git = result["git"]
    lines.extend(["", "## Git", ""])
    if not git["available"]:
        lines.append(f"Indisponível: {git['reason']}.")
    else:
        lines.extend(["| Semana | Início | Commits |", "| --- | --- | ---: |"])
        for row in git["weeks"]:
            lines.append(f"| {row['week']} | {row['start']} | {row['commits']} |")
        lines.extend(["", "| Autor | Commits |", "| --- | ---: |"])
        for row in git["authors"]:
            lines.append(f"| {_cell(row['name'])} | {row['commits']} |")
        if not git["authors"]:
            lines.append("| — | 0 |")
    lines.append("")
    return "\n".join(lines)
