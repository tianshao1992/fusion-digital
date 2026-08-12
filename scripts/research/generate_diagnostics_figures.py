#!/usr/bin/env python3
"""Generate deterministic Nature/Science-style figures for the diagnostics report."""

from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


W, H = 2400, 1380
BG = "#F6F4EE"
PANEL = "#FCFBF7"
INK = "#102322"
MUTED = "#526563"
LINE = "#BCC9C5"
ORANGE = "#F47C20"
CYAN = "#00989A"
PURPLE = "#7057B5"
GREEN = "#4A8C72"
RED = "#A9473D"
PALE_ORANGE = "#FBE9D8"
PALE_CYAN = "#DDF1EF"
PALE_PURPLE = "#E9E3F4"
PALE_GREEN = "#E5F0E9"
WHITE = "#FFFFFF"


def font_path() -> str:
    candidates = [
        os.environ.get("FUSIONDIGITAL_CJK_FONT"),
        r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\msyhbd.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/System/Library/Fonts/PingFang.ttc",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    raise FileNotFoundError("No CJK font found. Set FUSIONDIGITAL_CJK_FONT.")


FONT_PATH = font_path()


def f(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = r"C:\Windows\Fonts\msyhbd.ttc" if bold and Path(r"C:\Windows\Fonts\msyhbd.ttc").exists() else FONT_PATH
    return ImageFont.truetype(path, size=size)


def canvas(title: str, subtitle: str, index: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image)
    draw.text((105, 72), index, font=f(26, True), fill=CYAN)
    draw.text((105, 120), title, font=f(58, True), fill=INK)
    draw.text((105, 202), subtitle, font=f(27), fill=MUTED)
    draw.line((105, 258, W - 105, 258), fill=LINE, width=3)
    return image, draw


def wrap(draw: ImageDraw.ImageDraw, value: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    lines: list[str] = []
    for manual_line in value.splitlines() or [""]:
        if draw.textbbox((0, 0), manual_line, font=font)[2] <= max_width:
            lines.append(manual_line)
            continue
        # Preserve English words when possible; fall back to character wrapping for
        # CJK text or an individual token wider than the available box.
        units = manual_line.split(" ") if " " in manual_line else list(manual_line)
        separator = " " if " " in manual_line else ""
        current = ""
        for unit in units:
            trial = f"{current}{separator if current else ''}{unit}"
            if draw.textbbox((0, 0), trial, font=font)[2] <= max_width or not current:
                current = trial
                continue
            lines.append(current)
            if draw.textbbox((0, 0), unit, font=font)[2] <= max_width:
                current = unit
                continue
            fragment = ""
            for char in unit:
                char_trial = fragment + char
                if draw.textbbox((0, 0), char_trial, font=font)[2] <= max_width or not fragment:
                    fragment = char_trial
                else:
                    lines.append(fragment)
                    fragment = char
            current = fragment
        if current:
            lines.append(current)
    return lines


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], value: str, font: ImageFont.FreeTypeFont, fill: str, spacing: int = 8) -> None:
    x0, y0, x1, y1 = box
    lines = wrap(draw, value, font, x1 - x0 - 30)
    line_h = font.size + spacing
    start_y = y0 + (y1 - y0 - len(lines) * line_h + spacing) / 2
    for idx, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        draw.text(((x0 + x1 - (bbox[2] - bbox[0])) / 2, start_y + idx * line_h), line, font=font, fill=fill)


def box(draw: ImageDraw.ImageDraw, xy: tuple[int, int, int, int], fill: str = PANEL, outline: str = LINE, radius: int = 24, width: int = 3) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str = CYAN, width: int = 6, head: int = 18) -> None:
    draw.line((*start, *end), fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    p1 = (end[0] - head * math.cos(angle - 0.55), end[1] - head * math.sin(angle - 0.55))
    p2 = (end[0] - head * math.cos(angle + 0.55), end[1] - head * math.sin(angle + 0.55))
    draw.polygon([end, p1, p2], fill=color)


def footer(draw: ImageDraw.ImageDraw, note: str) -> None:
    draw.line((105, H - 106, W - 105, H - 106), fill=LINE, width=2)
    draw.text((105, H - 82), note, font=f(21), fill=MUTED)
    label = "FusionDigital · 2026"
    width = draw.textbbox((0, 0), label, font=f(21, True))[2]
    draw.text((W - 105 - width, H - 82), label, font=f(21, True), fill=CYAN)


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, dpi=(180, 180))


def measurement_chain(out: Path) -> None:
    image, draw = canvas("聚变诊断的可信测量链", "不是一条曲线，而是从实体、仪器和计量到状态、决策与证据的可追溯转换", "DIAG / 01")
    items = [
        ("实体状态", "等离子体 · PFC · 磁体 · 电厂设备", PALE_ORANGE, ORANGE),
        ("信号形成", "场 · 光子 · 微波 · 中子 · 力热声", PALE_CYAN, CYAN),
        ("仪器响应", "几何 · 光路 · 探测器 · 电子学 · 采样", PALE_PURPLE, PURPLE),
        ("标定与质量", "单位 · 时间 · 漂移 · 饱和 · 不确定度", PALE_GREEN, GREEN),
        ("反演与融合", "前向模型 · 先验 · 层析 · 数据同化", PALE_CYAN, CYAN),
        ("状态与决策", "物理解释 · PCS · 保护 · 运维 · 寿命", PALE_ORANGE, ORANGE),
    ]
    margin, gap = 105, 24
    card_w = (W - 2 * margin - gap * 5) // 6
    y0, y1 = 405, 850
    for idx, (title, detail, fill, accent) in enumerate(items):
        x0 = margin + idx * (card_w + gap)
        x1 = x0 + card_w
        box(draw, (x0, y0, x1, y1), fill=fill, outline=accent, radius=28, width=4)
        draw.ellipse((x0 + 26, y0 + 28, x0 + 82, y0 + 84), fill=accent)
        draw.text((x0 + 43, y0 + 39), str(idx + 1), font=f(22, True), fill="#FFFFFF")
        centered_text(draw, (x0 + 14, y0 + 100, x1 - 14, y0 + 210), title, f(32, True), INK)
        centered_text(draw, (x0 + 22, y0 + 220, x1 - 22, y1 - 90), detail, f(24), MUTED, spacing=11)
        draw.text((x0 + 28, y1 - 58), ["x", "H(x)", "yraw", "ycal", "p(x|y)", "state"][idx], font=f(22, True), fill=accent)
        if idx < 5:
            arrow(draw, (x1 + 5, (y0 + y1) // 2), (x1 + gap - 5, (y0 + y1) // 2), color=INK, width=4, head=13)
    box(draw, (300, 930, W - 300, 1120), fill=PANEL, outline=LINE, radius=20)
    draw.text((345, 968), "观测方程", font=f(26, True), fill=CYAN)
    draw.text((345, 1016), "y(t) = H[x(t), θdevice, θdiag, c(t)] + ε(t)", font=f(32, True), fill=INK)
    draw.text((345, 1068), "数字孪生必须同时保存数值、单位、坐标、时钟、质量、不确定度、标定版本与来源血缘。", font=f(24), fill=MUTED)
    footer(draw, "架构综合图；箭头表示信息变换与证据传递，不代表单一同步采样周期。")
    save(image, out / "diagnostics-measurement-chain-nature.png")


def taxonomy(out: Path, task_meta: dict) -> None:
    image, draw = canvas("DG0–DG11 聚变诊断分类", "以信息产品为主轴，以仪器原理为次级标签；合成诊断和 AI 都是横切能力", "DIAG / 02")
    x_left, x_right = 130, W - 130
    top_y, mid_y, bottom_y = 335, 685, 1008
    box(draw, (x_left, top_y, x_right, top_y + 170), fill=PALE_GREEN, outline=GREEN, radius=24, width=4)
    centered_text(draw, (x_left + 30, top_y + 10, x_right - 30, top_y + 90), "DG0  诊断系统工程、计量与健康", f(34, True), INK)
    centered_text(draw, (x_left + 40, top_y + 82, x_right - 40, top_y + 155), "需求 · 端口/几何 · 标定 · 时间同步 · 数据质量 · 环境适配 · 自检与可维护性", f(24), MUTED)
    measure_tasks = [f"DG{i}" for i in range(1, 9)]
    gap = 20
    card_w = (x_right - x_left - gap * 3) // 4
    card_h = 135
    for idx, task in enumerate(measure_tasks):
        row, col = divmod(idx, 4)
        x0 = x_left + col * (card_w + gap)
        y0 = mid_y + row * (card_h + 20) - 105
        color = [ORANGE, CYAN, PURPLE, GREEN][col]
        fill = [PALE_ORANGE, PALE_CYAN, PALE_PURPLE, PALE_GREEN][col]
        box(draw, (x0, y0, x0 + card_w, y0 + card_h), fill=fill, outline=color, radius=18, width=3)
        draw.text((x0 + 20, y0 + 18), task, font=f(24, True), fill=color)
        centered_text(draw, (x0 + 65, y0 + 12, x0 + card_w - 15, y0 + card_h - 10), task_meta[task]["label"], f(23, True), INK)
    cross = ["DG9", "DG10", "DG11"]
    labels = ["合成诊断与前向模型", "集成反演、层析与数据同化", "实时诊断、AI 与决策接口"]
    for idx, (task, label) in enumerate(zip(cross, labels)):
        x0 = x_left + idx * ((x_right - x_left + gap) // 3)
        x1 = x_left + (idx + 1) * ((x_right - x_left + gap) // 3) - gap
        color = [PURPLE, CYAN, ORANGE][idx]
        fill = [PALE_PURPLE, PALE_CYAN, PALE_ORANGE][idx]
        box(draw, (x0, bottom_y, x1, bottom_y + 165), fill=fill, outline=color, radius=24, width=4)
        centered_text(draw, (x0 + 20, bottom_y + 12, x1 - 20, bottom_y + 85), f"{task}  {label}", f(27, True), INK)
        centered_text(draw, (x0 + 24, bottom_y + 85, x1 - 24, bottom_y + 150), ["状态 → 仪器可观测量", "多源观测 → 一致状态", "可信状态 → 受治理行动"][idx], f(22), MUTED)
    arrow(draw, (W // 2, top_y + 180), (W // 2, mid_y - 115), color=GREEN, width=5)
    arrow(draw, (W // 2, mid_y + 300), (W // 2, bottom_y - 15), color=CYAN, width=5)
    footer(draw, "主分类按数字孪生所需信息产品组织；同一仪器可关联多个 DG 任务。")
    save(image, out / "diagnostics-taxonomy-nature.png")


def timescale(out: Path) -> None:
    image, draw = canvas("嵌套时间尺度：从快速事件到全寿命状态", "典型数量级用于架构分层，不是统一采样指标或装置性能承诺", "DIAG / 03")
    left, right = 420, W - 150
    axis_y = 1095
    draw.line((left, axis_y, right, axis_y), fill=INK, width=4)
    ticks = [(-6, "1 μs"), (-3, "1 ms"), (0, "1 s"), (3, "17 min"), (6, "12 d"), (9, "32 y")]
    for power, label in ticks:
        x = left + (power + 6) / 15 * (right - left)
        draw.line((x, axis_y - 13, x, axis_y + 13), fill=INK, width=3)
        bbox = draw.textbbox((0, 0), label, font=f(22))
        draw.text((x - (bbox[2] - bbox[0]) / 2, axis_y + 25), label, font=f(22), fill=MUTED)
    ranges = [
        ("高频磁 / Mirnov / 快事件", -6, -2, ORANGE),
        ("反射计 / ECE / 波动成像", -5, -1, CYAN),
        ("平衡 / 位形 / 实时状态", -4, 0, PURPLE),
        ("光谱 / 辐射 / 热负荷", -4, 1.5, GREEN),
        ("Thomson / 剖面产品", -3, 1, ORANGE),
        ("燃料循环 / 真空 / 低温", -0.5, 5.5, CYAN),
        ("标定漂移 / 维护趋势", 3, 8, PURPLE),
        ("材料损伤 / 寿命 / 退役", 4.5, 9, GREEN),
    ]
    for idx, (label, p0, p1, color) in enumerate(ranges):
        y = 345 + idx * 85
        draw.text((105, y - 4), label, font=f(24, True), fill=INK)
        x0 = left + (p0 + 6) / 15 * (right - left)
        x1 = left + (p1 + 6) / 15 * (right - left)
        draw.rounded_rectangle((x0, y, x1, y + 38), radius=19, fill=color)
        draw.ellipse((x0 - 4, y - 4, x0 + 42, y + 42), outline=color, width=3)
        draw.ellipse((x1 - 38, y - 4, x1 + 4, y + 42), outline=color, width=3)
    footer(draw, "编辑性数量级综合；实际范围取决于装置、视线、信噪比、分析算法与决策用途。")
    save(image, out / "diagnostics-timescale-nature.png")


def digital_twin_architecture(out: Path) -> None:
    image, draw = canvas("诊断数字孪生参考架构", "六层共享时间、配置、坐标与证据；模型预测通过合成诊断回到观测空间", "DIAG / 04")
    labels = [
        ("06 证据与治理", "VVUQ · 适用域 · 审批 · 权限 · 回滚 · 审计", PALE_ORANGE, ORANGE),
        ("05 决策服务", "实验解释 · PCS 状态 · 保护输入 · 运维 · 寿命", PALE_CYAN, CYAN),
        ("04 模型与合成诊断", "物理/工程模型 · 前向响应 · 代理 · 故障模型", PALE_PURPLE, PURPLE),
        ("03 观测与融合状态", "原始 · 校正 · 反演 · 后验 · 质量与不确定度", PALE_GREEN, GREEN),
        ("02 时间、配置与语义", "时钟 · 坐标 · 几何 · 单位 · 通道 · 场景 · 血缘", PALE_CYAN, CYAN),
        ("01 实体与仪器", "等离子体 · PFC · 磁体 · 电厂设备 · 诊断 · 参考源", PALE_ORANGE, ORANGE),
    ]
    x0, x1 = 260, W - 260
    y = 318
    for idx, (title, detail, fill, accent) in enumerate(labels):
        y0 = y + idx * 142
        box(draw, (x0, y0, x1, y0 + 112), fill=fill, outline=accent, radius=20, width=3)
        draw.text((x0 + 36, y0 + 24), title, font=f(27, True), fill=accent)
        draw.text((x0 + 450, y0 + 27), detail, font=f(24), fill=INK)
    arrow(draw, (W - 195, 1030), (W - 195, 365), color=CYAN, width=6)
    centered_text(draw, (W - 180, 535, W - 25, 675), "状态 / 证据\n向上", f(20, True), CYAN)
    arrow(draw, (190, 365), (190, 1030), color=ORANGE, width=6)
    centered_text(draw, (25, 535, 175, 675), "预测 / 配置 / 行动\n向下", f(20, True), ORANGE)
    footer(draw, "模型—观测残差必须写回适用域、标定和不确定度；独立保护与安全链不被孪生替代。")
    save(image, out / "diagnostics-digital-twin-architecture-nature.png")


def synthetic_loop(out: Path) -> None:
    image, draw = canvas("合成诊断：把模拟与实验放到同一观测空间", "比较的是仪器会看到的信号，而不是把模拟真值直接与反演结果混为一谈", "DIAG / 05")
    cx, cy = W // 2, 735
    nodes = [
        (cx, 350, "物理 / 工程状态", "x, geometry, materials", ORANGE, PALE_ORANGE),
        (1780, 520, "诊断前向模型", "ray tracing · atomic · response", PURPLE, PALE_PURPLE),
        (1780, 900, "合成观测", "sampling · noise · latency", CYAN, PALE_CYAN),
        (cx, 1070, "残差与 VVUQ", "bias · uncertainty · applicability", GREEN, PALE_GREEN),
        (620, 900, "真实仪器信号", "raw · calibrated · quality", CYAN, PALE_CYAN),
        (620, 520, "装置与诊断配置", "LOS · calibration · timing", PURPLE, PALE_PURPLE),
    ]
    positions = []
    for x, y, title, detail, accent, fill in nodes:
        rect = (x - 245, y - 78, x + 245, y + 78)
        positions.append(rect)
        box(draw, rect, fill=fill, outline=accent, radius=28, width=4)
        centered_text(draw, (rect[0] + 15, rect[1] + 8, rect[2] - 15, rect[1] + 78), title, f(27, True), INK)
        centered_text(draw, (rect[0] + 15, rect[1] + 75, rect[2] - 15, rect[3] - 8), detail, f(20), MUTED)
    for idx in range(len(positions)):
        a = positions[idx]
        b = positions[(idx + 1) % len(positions)]
        start = ((a[0] + a[2]) // 2, a[3]) if idx in (0, 1) else (a[0], (a[1] + a[3]) // 2)
        if idx == 0: start, end = (a[2], (a[1]+a[3])//2), (b[0], (b[1]+b[3])//2)
        elif idx == 1: start, end = ((a[0]+a[2])//2, a[3]), ((b[0]+b[2])//2, b[1])
        elif idx == 2: start, end = (a[0], (a[1]+a[3])//2), (b[2], (b[1]+b[3])//2)
        elif idx == 3: start, end = (a[0], (a[1]+a[3])//2), (b[2], (b[1]+b[3])//2)
        elif idx == 4: start, end = ((a[0]+a[2])//2, a[1]), ((b[0]+b[2])//2, b[3])
        else: start, end = (a[2], (a[1]+a[3])//2), (b[0], (b[1]+b[3])//2)
        arrow(draw, start, end, color=INK, width=4, head=15)
    box(draw, (cx - 250, cy - 85, cx + 250, cy + 85), fill=INK, outline=INK, radius=85)
    centered_text(draw, (cx - 225, cy - 62, cx + 225, cy + 62), "同一观测空间\n可解释残差", f(29, True), WHITE)
    footer(draw, "前向模型可分为高保真、快速和代理层；各层必须共享几何、响应、版本和验证证据。")
    save(image, out / "diagnostics-synthetic-loop-nature.png")


def inference_graph(out: Path) -> None:
    image, draw = canvas("集成反演：多诊断共同约束一个带不确定度的状态", "共享状态提高信息利用率，也会放大共同几何、平衡或原子模型的系统偏差", "DIAG / 06")
    inputs = ["磁测量", "干涉 / 反射", "Thomson / ECE", "CXRS / XICS", "Bolometry / SXR", "中子 / 伽马"]
    for idx, label in enumerate(inputs):
        y = 345 + idx * 135
        box(draw, (110, y, 560, y + 90), fill=PANEL, outline=CYAN, radius=18, width=3)
        centered_text(draw, (125, y + 5, 545, y + 85), label, f(25, True), INK)
        arrow(draw, (560, y + 45), (830, 735), color=CYAN, width=3, head=12)
    box(draw, (830, 450, 1280, 1020), fill=PALE_PURPLE, outline=PURPLE, radius=30, width=4)
    centered_text(draw, (865, 480, 1245, 640), "前向模型与\n似然函数", f(33, True), INK)
    centered_text(draw, (870, 665, 1240, 825), "几何 · 响应 · 噪声\n先验 · 正则 · 相关性", f(24), MUTED)
    centered_text(draw, (870, 850, 1240, 990), "Bayesian / GP\nMAP · MCMC · Filter", f(23, True), PURPLE)
    arrow(draw, (1280, 735), (1510, 735), color=INK, width=6, head=20)
    box(draw, (1510, 390, 2260, 1080), fill=PALE_GREEN, outline=GREEN, radius=34, width=4)
    centered_text(draw, (1560, 420, 2210, 550), "共同状态后验", f(37, True), INK)
    products = ["平衡与电流", "ne / Te / Ti / flow", "辐射与热负荷", "快粒子与聚变功率", "协方差 / 置信区间", "残差 / OOD / 质量门"]
    for idx, label in enumerate(products):
        y = 575 + idx * 73
        draw.ellipse((1570, y + 5, 1590, y + 25), fill=GREEN)
        draw.text((1615, y), label, font=f(24), fill=INK)
    footer(draw, "冗余通道只有在传感原理、标定链和故障模式足够独立时，才构成强交叉验证。")
    save(image, out / "diagnostics-inference-graph-nature.png")


def realtime_governance(out: Path) -> None:
    image, draw = canvas("实时诊断与 AI：能力必须经过质量门和授权门", "AI 可去噪、代理反演和识别异常，但不能把生成结果伪装成实测，也不能绕过独立保护", "DIAG / 07")
    items = [
        ("原始流", "time · units · channel", CYAN, PALE_CYAN),
        ("质量门", "freshness · saturation\n· drift", GREEN, PALE_GREEN),
        ("物理 / AI 状态", "estimate · UQ · OOD\n· residual", PURPLE, PALE_PURPLE),
        ("候选决策", "PCS state · HMI\n· maintenance", ORANGE, PALE_ORANGE),
        ("授权与安全门", "permissions · limits\n· fallback", RED, "#F5E1DE"),
        ("受控行动", "actuator · procedure\n· evidence", CYAN, PALE_CYAN),
    ]
    margin, gap = 110, 30
    card_w = (W - 2 * margin - 5 * gap) // 6
    y0, y1 = 465, 910
    for idx, (title, detail, accent, fill) in enumerate(items):
        x0 = margin + idx * (card_w + gap)
        x1 = x0 + card_w
        box(draw, (x0, y0, x1, y1), fill=fill, outline=accent, radius=28, width=4)
        draw.rectangle((x0, y0, x1, y0 + 14), fill=accent)
        centered_text(draw, (x0 + 15, y0 + 50, x1 - 15, y0 + 160), title, f(28, True), INK)
        centered_text(draw, (x0 + 20, y0 + 170, x1 - 20, y1 - 80), detail, f(22), MUTED)
        draw.text((x0 + 25, y1 - 58), f"0{idx + 1}", font=f(24, True), fill=accent)
        if idx < 5:
            arrow(draw, (x1 + 4, (y0 + y1)//2), (x1 + gap - 4, (y0 + y1)//2), color=INK, width=4, head=13)
    box(draw, (420, 995, W - 420, 1135), fill=INK, outline=INK, radius=20)
    centered_text(draw, (450, 1012, W - 450, 1118), "影子运行 → 故障注入 → 最坏时延 → 配置审批 → 可回滚发布", f(28, True), WHITE)
    footer(draw, "机器保护与核安全链可以消费经批准的诊断输入，但保留独立的确定性、权限和最终权威。")
    save(image, out / "diagnostics-realtime-governance-nature.png")


def device_coverage(out: Path, devices: list[dict], task_meta: dict) -> None:
    image, draw = canvas("装置 × 诊断任务：公开证据覆盖矩阵", "颜色表示装置档案中记录的任务关联，不代表所有系统同时可用或具备相同成熟度", "DIAG / 08")
    selected = devices[:20]
    left, top = 470, 335
    cell_w = 135
    cell_h = 42
    for col, task in enumerate([f"DG{i}" for i in range(12)]):
        x = left + col * cell_w
        draw.text((x + 30, top - 60), task, font=f(21, True), fill=CYAN if col in (0,9,10,11) else INK)
    for row, device in enumerate(selected):
        y = top + row * cell_h
        draw.text((110, y + 7), device["name"][:24], font=f(20, True), fill=INK)
        tasks = set(device.get("primaryTasks", []))
        for col, task in enumerate([f"DG{i}" for i in range(12)]):
            x = left + col * cell_w
            fill = CYAN if task in tasks else "#E5E7E3"
            draw.rectangle((x, y, x + cell_w - 5, y + cell_h - 5), fill=fill, outline=BG)
            if task in tasks:
                draw.ellipse((x + cell_w//2 - 6, y + cell_h//2 - 6, x + cell_w//2 + 6, y + cell_h//2 + 6), fill=WHITE)
    legend_y = top + len(selected) * cell_h + 35
    draw.rectangle((left, legend_y, left + 55, legend_y + 28), fill=CYAN)
    draw.text((left + 75, legend_y - 2), "装置档案有公开关联证据", font=f(21), fill=MUTED)
    draw.rectangle((left + 480, legend_y, left + 535, legend_y + 28), fill="#E5E7E3")
    draw.text((left + 555, legend_y - 2), "未在本版档案中确认", font=f(21), fill=MUTED)
    footer(draw, "排序仅为显示；应点击装置档案回到代表论文、代码、验证层级和公开资料边界。")
    save(image, out / "diagnostics-device-coverage-nature.png")


def roadmap(out: Path) -> None:
    image, draw = canvas("FusionDigital 聚变诊断数字孪生路线", "从磁诊断可信回放逐步扩展到多诊断状态、SIL/HIL、受治理在线服务和整厂寿命管理", "DIAG / 09")
    stages = [
        ("R0", "配置与磁诊断基线", "0–12 月", "几何/标定/时钟/MEQ-DINA 回放", CYAN),
        ("R1", "合成诊断与独立观测", "12–24 月", "干涉/ECE/TS/IR/bolometry 观测闭环", PURPLE),
        ("R2", "多诊断状态服务", "18–36 月", "联合反演 · UQ · 残差 · 质量门", GREEN),
        ("R3", "诊断系统 SIL/HIL", "30–48 月", "真实采集/网络/PCS/故障注入", ORANGE),
        ("R4", "受治理在线能力", "42–60 月", "影子 → 只读 → 有限闭环 · 可回滚", RED),
        ("R5", "整厂诊断孪生", "48–96 月", "设备健康 · RAMI · 寿命 · 维护优化", CYAN),
    ]
    x0, x1 = 850, W - 150
    axis_y = 1050
    draw.line((x0, axis_y, x1, axis_y), fill=INK, width=4)
    for month in range(0, 97, 12):
        x = x0 + month / 96 * (x1 - x0)
        draw.line((x, axis_y - 12, x, axis_y + 12), fill=INK, width=2)
        label = str(month)
        draw.text((x - 10, axis_y + 24), label, font=f(19), fill=MUTED)
    draw.text((x1 - 20, axis_y + 55), "月", font=f(20, True), fill=MUTED)
    spans = [(0,12),(12,24),(18,36),(30,48),(42,60),(48,96)]
    for idx, ((sid, title, period, gate, color), (start, end)) in enumerate(zip(stages, spans)):
        y = 340 + idx * 112
        draw.text((105, y), sid, font=f(25, True), fill=color)
        draw.text((185, y), title, font=f(25, True), fill=INK)
        for line_index, line in enumerate(wrap(draw, gate, f(19), 600)[:2]):
            draw.text((185, y + 38 + line_index * 27), line, font=f(19), fill=MUTED)
        sx = x0 + start / 96 * (x1 - x0)
        ex = x0 + end / 96 * (x1 - x0)
        draw.rounded_rectangle((sx, y + 5, ex, y + 45), radius=20, fill=color)
        draw.text((ex + 18, y + 8), period, font=f(20, True), fill=color)
    footer(draw, "时间为建议区间并允许并行，不是已批准的项目进度承诺；每阶段以证据门而不是日历自动晋级。")
    save(image, out / "diagnostics-roadmap-nature.png")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--landscape", type=Path, required=True)
    parser.add_argument("--devices", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    landscape = json.loads(args.landscape.read_text(encoding="utf-8"))
    devices = json.loads(args.devices.read_text(encoding="utf-8"))["devices"]
    out = args.output_dir
    measurement_chain(out)
    taxonomy(out, landscape["taskMeta"])
    timescale(out)
    digital_twin_architecture(out)
    synthetic_loop(out)
    inference_graph(out)
    realtime_governance(out)
    device_coverage(out, devices, landscape["taskMeta"])
    roadmap(out)
    print(json.dumps({"figures": 9, "outputDir": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
