#!/usr/bin/env python3
"""Pré-visualizações dos widgets (as imagens que o launcher mostra na lista de widgets).

Repete em Python o desenho de app/src/main/java/app/minecoin/Widgets.java, com os mesmos assets, a partir de um
resumo igual ao que o app manda ao Android (Minecoin.widgetSnapshot() no mundo de exemplo):

    python3 tools/widget_previews.py snapshot.json [pasta-de-saída]

Sem pasta de saída, grava em app/src/main/res/drawable-nodpi/widget_preview_*.png.
Ao mudar o desenho em Widgets.java, mude aqui também.
"""
import datetime
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'app', 'src', 'main', 'assets')
OUT = os.path.join(ROOT, 'app', 'src', 'main', 'res', 'drawable-nodpi')

WHITE, GRAY, GOLD = (255, 255, 255), (170, 170, 170), (255, 170, 0)
GREEN, RED, YELLOW, XP = (85, 255, 85), (255, 85, 85), (255, 255, 85), (128, 255, 32)
MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro',
          'Novembro', 'Dezembro']
# (largura, altura) em dp de cada widget na pré-visualização; densidade 2.625 (comum em celulares)
SIZES = {'net_worth': (250, 70), 'goal': (250, 70), 'month': (250, 80), 'achievements': (250, 130)}
DENSITY = 2.625


def img(path):
    return Image.open(os.path.join(ASSETS, path)).convert('RGBA')


class Painter:
    def __init__(self, w, h, density):
        self.w, self.h, self.density = w, h, density
        self.im = Image.new('RGBA', (w, h))
        self.d = ImageDraw.Draw(self.im)
        self.d.fontmode = '1'
        self.u = 1
        self.fonts = {}

    def fit(self, units, units_w):
        self.u = max(1, round(2 * self.density))
        while self.u > 1 and (units * self.u > self.h or units_w * self.u > self.w):
            self.u -= 1

    def font(self, scale):
        size = 8 * self.u * scale
        if size not in self.fonts:
            self.fonts[size] = ImageFont.truetype(os.path.join(ASSETS, 'fonts', 'minecraft.ttf'), size)
        return self.fonts[size]

    def background(self, theme):
        block, shade = {'nether': ('netherrack', (20, 0, 0, 168)), 'end': ('end_stone', (16, 4, 30, 204)),
                        'deep': ('deepslate', (0, 0, 0, 140))}.get(theme, ('dirt', (0, 0, 0, 158)))
        tex = img('mc/block/%s.png' % block)
        t = tex.resize((16 * 2 * self.u, 16 * 2 * self.u), Image.NEAREST)
        for y in range(0, self.h, t.height):
            for x in range(0, self.w, t.width):
                self.im.paste(t, (x, y))
        self.im.alpha_composite(Image.new('RGBA', (self.w, self.h), shade))
        b, w, h = self.u, self.w, self.h
        self.d.rectangle((0, 0, w - 1, b - 1), fill='black')
        self.d.rectangle((0, h - b, w - 1, h - 1), fill='black')
        self.d.rectangle((0, 0, b - 1, h - 1), fill='black')
        self.d.rectangle((w - b, 0, w - 1, h - 1), fill='black')
        hl = Image.new('RGBA', (self.w, self.h))
        ImageDraw.Draw(hl).rectangle((b, b, w - b - 1, 2 * b - 1), fill=(255, 255, 255, 32))
        ImageDraw.Draw(hl).rectangle((b, 2 * b, 2 * b - 1, h - b - 1), fill=(255, 255, 255, 32))
        self.im.alpha_composite(hl)

    def width(self, s, scale):
        return math.ceil(self.font(scale).getlength(s))

    def raw(self, s, x, top, color, scale):
        self.d.text((x, top + 7 * self.u * scale), s, font=self.font(scale), fill=color, anchor='ls')

    def text(self, s, x, top, color, scale, max_w):
        if self.width(s, scale) > max_w:
            while len(s) > 1 and self.width(s + '…', scale) > max_w:
                s = s[:-1]
            s += '…'
        shadow = tuple(c // 4 for c in color)
        self.raw(s, x + self.u * scale, top + self.u * scale, shadow, scale)
        self.raw(s, x, top, color, scale)

    def scale_for(self, s, max_w, by_height, mx):
        scale = max(1, min(mx, by_height))
        while scale > 1 and self.width(s, scale) > max_w:
            scale -= 1
        return scale

    def item(self, name, x, y, size, locked=False):
        path = os.path.join(ASSETS, 'mc', 'item', name + '.png')
        b = img(path if os.path.exists(path) else 'mc/item/barrier.png').resize((size, size), Image.NEAREST)
        if locked:
            a = b.getchannel('A').point(lambda v: 153 if v else 0)
            b = Image.new('RGBA', b.size, (0, 0, 0, 0))
            b.putalpha(a)
        self.im.alpha_composite(b, (x, y))

    def net_worth(self, s):
        value, color = s['net'], RED if s.get('netNegative') else GOLD
        self.fit(8 + 3 + 8 + 10, 40)
        u, pad = self.u, 4 * self.u
        icon = min(self.h - 2 * pad, 32 * u)
        x = pad
        if self.w > self.h * 2 and icon >= 16:
            icon = icon // 16 * 16
            self.item('chest', x, (self.h - icon) // 2, icon)
            x += icon + 3 * u
        avail = self.w - x - pad
        scale = self.scale_for(value, avail, max(1, (self.h - 2 * pad - 11 * u) // (8 * u)), 4)
        top = (self.h - (19 * u + 8 * u * (scale - 1))) // 2
        self.text('Patrimônio líquido', x, top, GRAY, 1, avail)
        self.text(value, x, top + 11 * u, color, scale, avail)

    def goal(self, s):
        self.fit(8 + 2 + 5 + 3 + 8 + 6, 60)
        u, pad = self.u, 4 * self.u
        pct = s.get('pct', 0)
        level, meta = '%d%%' % math.floor(pct * 100), 'Meta: ' + s['goalText']
        bar_w = self.w - 2 * pad
        top = (self.h - 26 * u) // 2
        lx = (self.w - self.width(level, 1)) // 2
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            self.raw(level, lx + dx * u, top + dy * u, (0, 0, 0), 1)
        self.raw(level, lx, top, XP, 1)
        by = top + 10 * u
        self.im.alpha_composite(img('mc/gui/xp_bg.png').resize((bar_w, 5 * u), Image.NEAREST), (pad, by))
        if pct > 0:
            fg = img('mc/gui/xp_fg.png')
            fg = fg.crop((0, 0, max(1, round(fg.width * pct)), fg.height))
            self.im.alpha_composite(fg.resize((round(bar_w * pct), 5 * u), Image.NEAREST), (pad, by))
        mw = min(self.width(meta, 1), bar_w)
        self.text(meta, (self.w - mw) // 2, by + 8 * u, GRAY, 1, bar_w)

    def month(self, s):
        self.fit(8 + 3 + 8 + 3 + 8 + 6, 60)
        u, pad = self.u, 4 * self.u
        name = MONTHS[int(s['month'][5:]) - 1]
        header = self.h >= 38 * u
        col_w = (self.w - 2 * pad - 4 * u) // 2
        scale = min(self.scale_for(s['income'], col_w, 3, 2), self.scale_for(s['expense'], col_w, 3, 2))
        top = (self.h - ((11 * u if header else 0) + 11 * u + 8 * u * scale)) // 2
        if header:
            self.text(name, pad, top, YELLOW, 1, self.w - 2 * pad)
            top += 11 * u
        x2 = pad + col_w + 4 * u
        self.text('Entrou', pad, top, GRAY, 1, col_w)
        self.text('Saiu', x2, top, GRAY, 1, col_w)
        self.text(s['income'], pad, top + 11 * u, GREEN, scale, col_w)
        self.text(s['expense'], x2, top + 11 * u, RED, scale, col_w)

    def achievements(self, s):
        adv = s['adv']
        n = len(adv)
        self.fit(8 + 4 + 18 + 8, 18 * 4)
        u, pad = self.u, 4 * self.u
        count = '%d/%d' % (s['advCount'], s['advTotal'])
        self.text('Conquistas', pad, pad, WHITE, 1, self.w - 2 * pad)
        cw = self.width(count, 1)
        self.text(count, self.w - pad - cw, pad, GRAY, 1, cw)
        area_w, area_h = self.w - 2 * pad, self.h - 2 * pad - 12 * u
        best_t, best_cols = 0, n
        for cols in range(n, 0, -1):
            rows = -(-n // cols)
            t = min(area_w // (18 * cols), area_h // (18 * rows))
            if t > best_t:
                best_t, best_cols = t, cols
        t = max(1, best_t)
        slot, cols = 18 * t, best_cols
        rows = -(-n // cols)
        gx = (self.w - cols * slot) // 2
        gy = pad + 12 * u + max(0, (area_h - rows * slot) // 2)
        slot_img = img('mc/gui/slot.png').resize((slot, slot), Image.NEAREST)
        for i, a in enumerate(adv):
            x, y = gx + (i % cols) * slot, gy + (i // cols) * slot
            self.im.alpha_composite(slot_img, (x, y))
            self.item(a['icon'], x + t, y + t, 16 * t, not a['got'])


def render(kind, snap, w_dp, h_dp, density=DENSITY):
    p = Painter(round(w_dp * density), round(h_dp * density), density)
    p.fit(1, 1)
    p.background(snap.get('theme', 'overworld'))
    getattr(p, kind)(snap)
    return p.im


def main():
    snap = json.load(open(sys.argv[1]))
    out = sys.argv[2] if len(sys.argv) > 2 else OUT
    os.makedirs(out, exist_ok=True)
    for kind, (w, h) in SIZES.items():
        render(kind, snap, w, h).save(os.path.join(out, 'widget_preview_%s.png' % kind), optimize=True)
    print('ok', datetime.date.today())


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main()
