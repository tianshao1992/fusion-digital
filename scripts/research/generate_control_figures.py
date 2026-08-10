from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


W, H = 2400, 1350
BG = "#F4F7F5"
PAPER = "#FFFFFF"
INK = "#102018"
MUTED = "#607068"
DEEP = "#0F6B57"
DEEP_DARK = "#0D2B24"
ORANGE = "#FF8738"
CYAN = "#30BFA9"
PURPLE = "#7E6BC4"
BLUE = "#4B82B8"
RED = "#C4513B"
LINE = "#C9D5CF"
PALE_GREEN = "#E0F1EA"
PALE_ORANGE = "#FFF0E5"
PALE_PURPLE = "#EEEAFB"
PALE_BLUE = "#E8F0F8"


def font_path(bold: bool = False) -> str:
    candidates = [
        r"C:\Windows\Fonts\msyhbd.ttc" if bold else r"C:\Windows\Fonts\msyh.ttc",
        r"C:\Windows\Fonts\seguisb.ttf" if bold else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if bold else r"C:\Windows\Fonts\arial.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return candidate
    raise FileNotFoundError("No suitable font found")


def f(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(font_path(bold), size=size)


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    for paragraph in str(text).split("\n"):
        if not paragraph:
            lines.append("")
            continue
        current = ""
        for char in paragraph:
            trial = current + char
            if current and draw.textlength(trial, font=font) > width:
                lines.append(current)
                current = char
            else:
                current = trial
        if current:
            lines.append(current)
    return lines


def text_box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    title: str,
    body: str = "",
    *,
    fill: str = PAPER,
    outline: str = LINE,
    accent: str | None = None,
    title_color: str = INK,
    body_color: str = MUTED,
    radius: int = 18,
    title_size: int = 31,
    body_size: int = 22,
    pad: int = 26,
    tag: str | None = None,
) -> None:
    x1, y1, x2, y2 = xy
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=2)
    if accent:
        draw.rounded_rectangle((x1, y1, x1 + 10, y2), radius=radius, fill=accent)
        draw.rectangle((x1 + 5, y1, x1 + 12, y2), fill=accent)
    title_font = f(title_size, True)
    body_font = f(body_size)
    tx = x1 + pad + (8 if accent else 0)
    ty = y1 + pad
    if tag:
        tag_font = f(16, True)
        tag_width = int(draw.textlength(tag, font=tag_font)) + 24
        draw.rounded_rectangle((tx, ty, tx + tag_width, ty + 30), radius=8, fill=accent or DEEP)
        draw.text((tx + 12, ty + 5), tag, font=tag_font, fill=PAPER)
        ty += 43
    title_lines = wrap(draw, title, title_font, x2 - tx - pad)
    for line in title_lines:
        draw.text((tx, ty), line, font=title_font, fill=title_color)
        ty += title_size + 8
    if body:
        ty += 8
        for line in wrap(draw, body, body_font, x2 - tx - pad):
            draw.text((tx, ty), line, font=body_font, fill=body_color)
            ty += body_size + 9


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: str = DEEP, width: int = 5) -> None:
    draw.line((start, end), fill=color, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    length = 18
    spread = math.pi / 7
    p1 = (end[0] - length * math.cos(angle - spread), end[1] - length * math.sin(angle - spread))
    p2 = (end[0] - length * math.cos(angle + spread), end[1] - length * math.sin(angle + spread))
    draw.polygon((end, p1, p2), fill=color)


def header(draw: ImageDraw.ImageDraw, index: str, title: str, subtitle: str) -> None:
    draw.text((105, 70), index, font=f(20, True), fill=ORANGE)
    draw.text((105, 108), title, font=f(48, True), fill=INK)
    draw.text((105, 174), subtitle, font=f(23), fill=MUTED)
    draw.line((105, 220, W - 105, 220), fill=LINE, width=2)


def footer(draw: ImageDraw.ImageDraw, note: str) -> None:
    draw.line((105, H - 76, W - 105, H - 76), fill=LINE, width=2)
    draw.text((105, H - 56), note, font=f(16), fill=MUTED)
    draw.text((W - 390, H - 56), "FusionDigital · CONTROL ATLAS 2026", font=f(16, True), fill=DEEP)


def architecture(output: Path) -> None:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    header(d, "FIGURE C1 / CLOSED LOOP", "聚变集成控制的分权闭环", "状态、控制任务与执行器共享数据，但机器保护保持独立权威")

    y1, y2 = 325, 1040
    col_x = [105, 495, 920, 1370, 1810, 2295]
    titles = [
        ("测量与设备状态", "磁诊断 · 动理学诊断\n边界/壁诊断 · 执行器健康", ORANGE, PALE_ORANGE),
        ("T0 状态估计", "时间对齐 · 质量标志\n平衡/剖面/MHD/热状态", CYAN, PALE_GREEN),
        ("T1–T7 任务控制", "磁位形 · 剖面 · 稳定性\n排热 · 功率 · 安全终止", PURPLE, PALE_PURPLE),
        ("T8 监督与分配", "目标优先级 · 约束\n执行器分配 · 故障重构", DEEP, PALE_GREEN),
        ("执行器与装置", "PF/VS · NBI/RF\n气体/丸注 · 杂质/RMP/抽气", BLUE, PALE_BLUE),
    ]
    for i, (title, body, accent, fill) in enumerate(titles):
        text_box(d, (col_x[i], y1, col_x[i + 1] - 35, y2), title, body, fill=fill, accent=accent, title_size=28, body_size=21, pad=24, tag=f"0{i + 1}")
        if i < len(titles) - 1:
            arrow(d, (col_x[i + 1] - 30, 670), (col_x[i + 1] + 20, 670), color=DEEP, width=5)

    # feedback line
    d.line((2140, 1085, 300, 1085, 300, 1030), fill=CYAN, width=5)
    arrow(d, (300, 1085), (300, 1030), color=CYAN, width=5)
    d.text((970, 1100), "装置响应反馈 / measured plant response", font=f(19, True), fill=CYAN)

    # independent protection rail
    d.rounded_rectangle((105, 245, 2295, 300), radius=14, fill=DEEP_DARK)
    d.text((135, 258), "独立保护与安全系统", font=f(22, True), fill=PAPER)
    d.text((425, 260), "共享必要状态与事件；独立判断、独立链路、独立最终权限", font=f(19), fill="#B8CDC4")
    arrow(d, (2100, 300), (2100, 325), color=RED, width=5)
    footer(d, "逻辑架构图；具体周期、冗余与权限边界必须按装置安全分类确定。")
    im.save(output, quality=96)


def timescale(output: Path) -> None:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    header(d, "FIGURE C2 / TIMESCALE", "控制任务与典型时间尺度", "条带表示常见量级而非硬边界；同一任务会包含不同速率的估计、决策与执行")

    x0, x1 = 620, 2260
    labels = ["10 μs", "100 μs", "1 ms", "10 ms", "100 ms", "1 s", "10 s", "100 s"]
    for i, label in enumerate(labels):
        x = x0 + i * (x1 - x0) / (len(labels) - 1)
        d.line((x, 290, x, 1180), fill="#DCE4DF", width=2)
        d.text((x - 32, 250), label, font=f(17, True), fill=MUTED)

    rows = [
        ("T0", "状态估计与实时诊断", 0, 5, CYAN),
        ("T1", "启动、电流与磁通", 2, 7, ORANGE),
        ("T2", "位置、位形与边界", 0, 4, ORANGE),
        ("T3", "剖面与场景", 3, 7, PURPLE),
        ("T4", "稳定性与约束模式", 0, 5, RED),
        ("T5", "排热、粒子与壁", 2, 7, BLUE),
        ("T6", "性能、功率与燃烧", 3, 7, DEEP),
        ("T7", "失稳避免与安全终止", 0, 6, RED),
        ("T8", "多执行器协调", 2, 7, PURPLE),
        ("T9", "PCS、编排与验证", 0, 7, DEEP_DARK),
    ]
    row_h = 82
    for idx, (code, name, start_i, end_i, color) in enumerate(rows):
        y = 315 + idx * row_h
        d.text((105, y + 12), code, font=f(22, True), fill=color)
        d.text((175, y + 12), name, font=f(22, True), fill=INK)
        sx = x0 + start_i * (x1 - x0) / 7
        ex = x0 + end_i * (x1 - x0) / 7
        d.rounded_rectangle((sx, y + 12, ex, y + 48), radius=18, fill=color)
        d.ellipse((sx - 6, y + 6, sx + 42, y + 54), fill=color)
        d.ellipse((ex - 36, y + 6, ex + 12, y + 54), fill=color)
    footer(d, "时间尺度随装置、诊断、执行器和控制层级变化；‘实时’必须同时报告最坏时延与抖动。")
    im.save(output, quality=96)


def pcs_layers(output: Path) -> None:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    header(d, "FIGURE C3 / PCS STACK", "PCS 不是一个控制器，而是分层运行基础设施", "算法、实时平台、脉冲编排、配置证据与保护边界必须分别治理")

    layers = [
        ("L6", "运行员与脉冲计划", "目标场景 · 运行许可 · 人在回路批准", PALE_ORANGE, ORANGE),
        ("L5", "监督状态机与事件处理", "阶段切换 · 异常响应 · 恢复/终止策略", PALE_PURPLE, PURPLE),
        ("L4", "集成控制与执行器分配", "多目标约束 · 优先级 · 降额与重构", PALE_GREEN, DEEP),
        ("L3", "任务控制器", "磁位形 · 剖面 · MHD · 排热 · 功率", PAPER, BLUE),
        ("L2", "实时状态与诊断处理", "平衡/剖面估计 · 质量 · 事件检测", PALE_GREEN, CYAN),
        ("L1", "实时框架、网络与 I/O", "时钟 · 调度 · 数据传输 · 参数 · 日志", PAPER, DEEP_DARK),
        ("L0", "装置与本地设备控制", "诊断 · 电源 · 加热 · 燃料 · 壁与辅机", PALE_BLUE, BLUE),
    ]
    x_left, x_right = 425, 1960
    top = 278
    layer_h = 112
    for i, (code, title, body, fill, accent) in enumerate(layers):
        y = top + i * (layer_h + 12)
        d.rounded_rectangle((x_left, y, x_right, y + layer_h), radius=18, fill=fill, outline=LINE, width=2)
        d.rounded_rectangle((x_left, y, x_left + 10, y + layer_h), radius=18, fill=accent)
        d.rectangle((x_left + 5, y, x_left + 12, y + layer_h), fill=accent)
        d.rounded_rectangle((x_left + 28, y + 19, x_left + 78, y + 51), radius=8, fill=accent)
        d.text((x_left + 39, y + 24), code, font=f(17, True), fill=PAPER)
        d.text((x_left + 104, y + 15), title, font=f(25, True), fill=INK)
        d.text((x_left + 104, y + 61), body, font=f(18), fill=MUTED)

    # side rails
    text_box(d, (105, 278, 370, 1135), "配置与证据", "需求\n装置资产\n模型版本\n控制参数\n测试用例\n回放记录\n审批签名\n运行残差", fill=DEEP_DARK, outline=DEEP_DARK, title_color=PAPER, body_color="#B9CCC3", accent=ORANGE, title_size=25, body_size=20, pad=22)
    text_box(d, (2015, 278, 2295, 1135), "独立权限链", "设备保护\n中央联锁\n人员安全\n核安全\n硬件急停\n\nPCS 可请求\n但不替代", fill="#2D1914", outline=RED, title_color=PAPER, body_color="#E6C2B7", accent=RED, title_size=25, body_size=20, pad=22)
    for y in (445, 760, 1030):
        arrow(d, (370, y), (425, y), color=ORANGE, width=4)
        arrow(d, (2015, y), (1960, y), color=RED, width=4)
    footer(d, "层级是责任与接口划分，不限定具体产品；装置可将若干层部署在同一计算节点。")
    im.save(output, quality=96)


def verification(output: Path) -> None:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    header(d, "FIGURE C4 / V&V", "控制功能进入装置的证据阶梯", "每一级回答不同问题；上一级结果不能替代下一级实时、接口与安全验证")

    steps = [
        ("01", "单元与数值基准", "算法正确性、守恒、边界与回归", "E0–E1", DEEP),
        ("02", "开环与模型对比", "植物响应、参数敏感性、独立代码", "E1", CYAN),
        ("03", "历史放电回放", "真实输入、状态误差、控制后果", "E2", BLUE),
        ("04", "软件在环 SIL", "完整控制代码、状态机、异常注入", "E2–E3", PURPLE),
        ("05", "实时/HIL", "最坏时延、I/O、电源/网络和故障", "E3", ORANGE),
        ("06", "影子模式", "在线数据但无执行权限，比较建议与实绩", "E3", CYAN),
        ("07", "低风险闭环实验", "限定工况、人工批准、明确回退", "E4", ORANGE),
        ("08", "常规运行与持续保证", "变更治理、漂移监测、再验证与审计", "E4 / D4–D5", RED),
    ]
    cols = 4
    box_w, box_h = 515, 330
    gap_x, gap_y = 45, 55
    x_start, y_start = 105, 295
    for i, (num, title, body, badge, accent) in enumerate(steps):
        if i < cols:
            row, col = 0, i
        else:
            row, col = 1, 7 - i
        x = x_start + col * (box_w + gap_x)
        y = y_start + row * (box_h + gap_y)
        text_box(d, (x, y, x + box_w, y + box_h), title, body, fill=PAPER, accent=accent, title_size=27, body_size=20, pad=24, tag=num)
        d.rounded_rectangle((x + 28, y + box_h - 58, x + 155, y + box_h - 25), radius=8, fill=accent)
        d.text((x + 42, y + box_h - 53), badge, font=f(17, True), fill=PAPER)
        if row == 0 and col < cols - 1:
            arrow(d, (x + box_w, y + box_h // 2), (x + box_w + gap_x - 8, y + box_h // 2), color=LINE, width=4)
        elif row == 0 and col == cols - 1:
            arrow(d, (x + box_w // 2, y + box_h), (x + box_w // 2, y + box_h + gap_y - 8), color=LINE, width=4)
        elif row == 1 and col > 0:
            arrow(d, (x, y + box_h // 2), (x - gap_x + 8, y + box_h // 2), color=LINE, width=4)
    footer(d, "E 表示证据类型，D 表示部署责任；真实闭环 E4 不自动等于安全关键 D5。")
    im.save(output, quality=96)


def roadmap(output: Path) -> None:
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    header(d, "FIGURE C5 / ROADMAP", "FusionDigital 集成控制演进路线", "从 DINA / MEQ 可信回放起步，以证据门逐步扩大模型范围和动作权限")

    phases = [
        ("C0", "接口与资产包", "DINA/MEQ 接口\n装置配置 · 坐标 · 单位\n基准炮与回归测试", ORANGE),
        ("C1", "磁控制可信回放", "合成磁诊断\n真实控制器回放\n位形/电流/电源约束", CYAN),
        ("C2", "控制数字影子", "实时状态接入\n候选动作与风险预测\n逐炮残差和适用域", BLUE),
        ("C3", "多任务与执行器协调", "剖面 · MHD · 排热\n执行器能力与冲突\n分层 MPC / 参考治理", PURPLE),
        ("C4", "系统级 SIL / HIL", "真实 PCS 构建与时钟\nI/O、电源、网络故障\n版本签名与自动证据", DEEP),
        ("C5", "有限闭环到电厂协同", "低风险功能逐项放权\n燃烧/热循环/辅机协调\n独立保护与持续保证", RED),
    ]
    margin = 105
    box_w = 335
    gap = 45
    y1, y2 = 330, 1045
    for i, (code, title, body, accent) in enumerate(phases):
        x = margin + i * (box_w + gap)
        fill = PAPER if i % 2 == 0 else "#F9FBFA"
        text_box(d, (x, y1, x + box_w, y2), title, body, fill=fill, accent=accent, title_size=27, body_size=20, pad=23, tag=code)
        if i < len(phases) - 1:
            arrow(d, (x + box_w, 690), (x + box_w + gap - 8, 690), color=accent, width=5)
    d.text((115, 1090), "权限", font=f(18, True), fill=MUTED)
    d.line((190, 1105, 2250, 1105), fill=LINE, width=5)
    arrow(d, (190, 1105), (2250, 1105), color=ORANGE, width=5)
    d.text((205, 1125), "离线证据", font=f(17), fill=MUTED)
    d.text((1010, 1125), "影子 / HIL", font=f(17), fill=MUTED)
    d.text((2040, 1125), "受控闭环", font=f(17), fill=MUTED)
    footer(d, "每一阶段以可验证决策能力为出口；接入更多代码本身不构成成熟度升级。")
    im.save(output, quality=96)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    architecture(args.output_dir / "control-closed-loop-architecture-nature.png")
    timescale(args.output_dir / "control-task-timescale-nature.png")
    pcs_layers(args.output_dir / "control-pcs-layers-nature.png")
    verification(args.output_dir / "control-verification-ladder-nature.png")
    roadmap(args.output_dir / "control-digital-twin-roadmap-nature.png")
    print(f"Generated 5 control figures in {args.output_dir}")


if __name__ == "__main__":
    main()
