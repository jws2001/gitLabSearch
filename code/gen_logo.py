from PIL import Image, ImageDraw, ImageFilter

SIZE = 256
img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))

# 1) 深色渐变背景(GitLab 深紫 -> 深蓝,与前景 tanuki 橙色形成强对比)
grad = Image.new("RGBA", (SIZE, SIZE))
gp = grad.load()
c1 = (41, 41, 97)     # #292961 GitLab 深紫
c2 = (23, 19, 33)     # #171321 近黑深紫
for y in range(SIZE):
    for x in range(SIZE):
        t = (x + y) / (2 * (SIZE - 1))
        r = int(c1[0] + (c2[0] - c1[0]) * t)
        g = int(c1[1] + (c2[1] - c1[1]) * t)
        b = int(c1[2] + (c2[2] - c1[2]) * t)
        gp[x, y] = (r, g, b, 255)

# 圆角矩形遮罩
mask = Image.new("L", (SIZE, SIZE), 0)
md = ImageDraw.Draw(mask)
radius = 56
md.rounded_rectangle([0, 0, SIZE - 1, SIZE - 1], radius=radius, fill=255)
img.paste(grad, (0, 0), mask)

draw = ImageDraw.Draw(img)

# 2) 放大镜(白色)
# 放大镜圆环:外圆 - 内圆,产生圆环
cx, cy = 108, 108          # 镜片中心
r_out = 64                 # 外半径
ring_w = 14                # 圆环粗细
r_in = r_out - ring_w      # 内半径

# 画白色圆环
ring_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
rd = ImageDraw.Draw(ring_layer)
rd.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], fill=(255, 255, 255, 255))
rd.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=(0, 0, 0, 0))

# 放大镜把手(白色,从镜片右下延伸)
handle = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
hd = ImageDraw.Draw(handle)
# 把手角度 45°,起点靠近外圆边缘右下,终点在右下
import math
angle = math.radians(45)
sx = cx + int(math.cos(angle) * (r_out - 2))
sy = cy + int(math.sin(angle) * (r_out - 2))
ex = cx + int(math.cos(angle) * (r_out + 56))
ey = cy + int(math.sin(angle) * (r_out + 56))
hd.line([(sx, sy), (ex, ey)], fill=(255, 255, 255, 255), width=20)
# 把手两端圆润
hd.ellipse([ex - 10, ey - 10, ex + 10, ey + 10], fill=(255, 255, 255, 255))
hd.ellipse([sx - 10, sy - 10, sx + 10, sy + 10], fill=(255, 255, 255, 255))

# 3) 镜片内:白色底 + GitLab tanuki 三角(官方橙红配色)
tanuki = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
td = ImageDraw.Draw(tanuki)

# 先给镜片内部铺一层白底,让彩色 tanuki 清晰
td.ellipse([cx - r_in + 2, cy - r_in + 2, cx + r_in - 2, cy + r_in - 2],
           fill=(255, 255, 255, 255))

# 中心三角区域 - 以镜片中心为基准
scale = 0.58
R = int(r_in * scale)
top_y = cy - R
mid_y = cy
bot_y = cy + R

ORANGE_LIGHT = (252, 163, 38, 255)   # #FCA326 亮橙
ORANGE = (252, 109, 38, 255)         # #FC6D26 橙
RED = (226, 67, 41, 255)             # #E24329 橙红

# 左上三角(亮橙)
td.polygon([
    (cx - R, top_y),
    (cx, top_y),
    (cx - R // 2, mid_y + R // 6),
], fill=ORANGE_LIGHT)
# 右上三角(亮橙)
td.polygon([
    (cx, top_y),
    (cx + R, top_y),
    (cx + R // 2, mid_y + R // 6),
], fill=ORANGE_LIGHT)
# 中间左三角(橙色)
td.polygon([
    (cx - R // 2, mid_y + R // 6),
    (cx, top_y),
    (cx, bot_y),
], fill=ORANGE)
# 中间右三角(橙色)
td.polygon([
    (cx + R // 2, mid_y + R // 6),
    (cx, top_y),
    (cx, bot_y),
], fill=ORANGE)
# 底部 V 形(橙红)
td.polygon([
    (cx - R // 2, mid_y + R // 6),
    (cx + R // 2, mid_y + R // 6),
    (cx, bot_y),
], fill=RED)

# 合成:先镜内 tanuki,再放大镜圆环和把手(覆盖在上)
# tanuki 只保留在镜片圆内 - 用圆形遮罩
lens_mask = Image.new("L", (SIZE, SIZE), 0)
lm = ImageDraw.Draw(lens_mask)
lm.ellipse([cx - r_in + 2, cy - r_in + 2, cx + r_in - 2, cy + r_in - 2], fill=255)
tanuki_masked = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
tanuki_masked.paste(tanuki, (0, 0), lens_mask)

img = Image.alpha_composite(img, tanuki_masked)
img = Image.alpha_composite(img, ring_layer)
img = Image.alpha_composite(img, handle)

# 轻微投影提升质感:把手和圆环下方再加一圈淡阴影(可选,保持简洁,跳过)

img.save("/Users/songsong/Desktop/wensong.jiaoCODE/gitLabSearch/logo.png", "PNG")
print("logo.png saved", img.size)
