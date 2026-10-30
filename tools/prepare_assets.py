#!/usr/bin/env python3
"""Copia e prepara os assets do Minecraft usados pelo Baú.

Uso:
    git clone --depth 1 --filter=blob:none --sparse -b 26.3 \
        https://github.com/InventivetalentDev/minecraft-assets.git mc-assets
    (cd mc-assets && git sparse-checkout set assets/minecraft/textures assets/minecraft/font \
        assets/minecraft/sounds/random assets/minecraft/sounds/block/chest)
    python3 tools/prepare_assets.py mc-assets

Gera em app/src/main/assets/: mc/item, mc/block, mc/gui (sprites recortados para nine-slice),
sound/*.ogg e fonts/minecraft.ttf (fonte pixelada montada a partir de font/ascii.png e font/accented.png).
Também gera os ícones do app em app/src/main/res/mipmap-*.
"""
import json
import os
import shutil
import sys

from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'app', 'src', 'main', 'assets')
RES = os.path.join(ROOT, 'app', 'src', 'main', 'res')

# Itens usados como emblemas (categorias, contas, ativos, conquistas). Só texturas 16x16 sem tingimento.
ITEMS = '''
apple baked_potato beef bread cake carrot cookie cooked_beef cooked_chicken golden_apple golden_carrot honey_bottle
melon_slice mushroom_stew pumpkin_pie sweet_berries glow_berries milk_bucket water_bucket lava_bucket bucket
cod cooked_cod salmon sugar wheat egg
minecart chest_minecart furnace_minecart hopper_minecart tnt_minecart saddle elytra firework_rocket
book writable_book written_book enchanted_book knowledge_book paper map compass_00 clock_00 recovery_compass_00 spyglass
emerald diamond gold_ingot gold_nugget iron_ingot iron_nugget copper_ingot netherite_ingot netherite_scrap raw_gold
amethyst_shard echo_shard quartz lapis_lazuli redstone coal charcoal prismarine_crystals nether_star heart_of_the_sea
ender_pearl ender_eye experience_bottle totem_of_undying end_crystal dragon_breath ghast_tear blaze_rod
diamond_sword diamond_pickaxe diamond_axe iron_pickaxe golden_pickaxe wooden_pickaxe stone_pickaxe netherite_pickaxe
iron_sword golden_sword wooden_sword trident mace bow fishing_rod shears flint_and_steel brush
diamond_chestplate golden_chestplate iron_chestplate chainmail_chestplate netherite_chestplate turtle_helmet
diamond_helmet golden_helmet iron_helmet
music_disc_cat music_disc_13 music_disc_pigstep music_disc_otherside music_disc_relic
painting item_frame armor_stand name_tag lead bell lantern campfire flower_pot brewing_stand cauldron hopper
bone feather leather string stick slime_ball snowball egg brick nether_brick clay_ball
iron_chain repeater comparator trial_key ominous_trial_key wind_charge breeze_rod
bundle red_bundle blue_bundle green_bundle yellow_bundle purple_bundle
oak_boat oak_door iron_door spruce_door barrier structure_void
'''.split()

BLOCKS = '''
dirt stone cobblestone oak_planks spruce_planks dark_oak_planks grass_block_side grass_block_top netherrack nether_bricks
end_stone end_stone_bricks purpur_block obsidian deepslate bedrock bookshelf crafting_table_front crafting_table_top
gold_block diamond_block emerald_block iron_block lapis_block redstone_block amethyst_block glowstone tnt_side
barrel_side barrel_top sand gravel anvil copper_block coal_block netherite_block
'''.split()

BLOCK_ICONS = {
    'crafting_table': 'crafting_table_front', 'bookshelf': 'bookshelf', 'gold_block': 'gold_block',
    'diamond_block': 'diamond_block', 'emerald_block': 'emerald_block', 'iron_block': 'iron_block', 'tnt': 'tnt_side',
    'barrel': 'barrel_top', 'grass_block': 'grass_block_side', 'furnace': 'furnace_front', 'jukebox': 'jukebox_side',
    'bricks': 'bricks', 'glass': 'glass', 'oak_log': 'oak_log', 'pumpkin': 'carved_pumpkin', 'beacon': 'beacon',
}

# madeiras para o topo e a barra inferior (configuráveis em Ajustes)
WOODS = ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove', 'cherry', 'pale_oak', 'bamboo', 'crimson',
         'warped']

SOUNDS = {
    'click': 'random/click.ogg',
    'levelup': 'random/levelup.ogg',
    'orb': 'random/orb.ogg',
    'pop': 'random/pop.ogg',
    'break': 'random/break.ogg',
    'anvil': 'random/anvil_land.ogg',
    'chest_open': 'block/chest/open.ogg',
    'chest_close': 'block/chest/close1.ogg',
}

# sprites da interface copiados tal como estão (caminho relativo a textures/gui/sprites)
SPRITES = {
    'button': 'widget/button.png',
    'button_highlighted': 'widget/button_highlighted.png',
    'button_disabled': 'widget/button_disabled.png',
    'text_field': 'widget/text_field.png',
    'text_field_highlighted': 'widget/text_field_highlighted.png',
    'tab': 'widget/tab.png',
    'tab_selected': 'widget/tab_selected.png',
    'checkbox': 'widget/checkbox.png',
    'checkbox_selected': 'widget/checkbox_selected.png',
    'slot': 'container/slot.png',
    'hotbar': 'hud/hotbar.png',
    'hotbar_selection': 'hud/hotbar_selection.png',
    'xp_bg': 'hud/experience_bar_background.png',
    'xp_fg': 'hud/experience_bar_progress.png',
    'food_full': 'hud/food_full.png',
    'food_half': 'hud/food_half.png',
    'food_empty': 'hud/food_empty.png',
    'heart_container': 'hud/heart/container.png',
    'heart_full': 'hud/heart/full.png',
    'heart_half': 'hud/heart/half.png',
    'tooltip_bg': 'tooltip/background.png',
    'tooltip_frame': 'tooltip/frame.png',
    'toast_advancement': 'toast/advancement.png',
    'scroller': 'widget/scroller.png',
    'scroller_background': 'widget/scroller_background.png',
    'checkmark': 'icon/checkmark.png',
    'search': 'icon/search.png',
    'info': 'icon/info.png',
    'page_forward': 'widget/page_forward.png',
    'page_backward': 'widget/page_backward.png',
    'cross_button': 'widget/cross_button.png',
}


def main(src):
    mc = os.path.join(src, 'assets', 'minecraft')
    tex = os.path.join(mc, 'textures')
    for d in ('mc/item', 'mc/block', 'mc/gui', 'sound', 'fonts'):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)

    names = []
    for name in dict.fromkeys(ITEMS):
        im = Image.open(os.path.join(tex, 'item', name + '.png'))
        if im.size != (16, 16):
            print('pulando (não é 16x16):', name)
            continue
        out = name.replace('_00', '')
        im.save(os.path.join(OUT, 'mc', 'item', out + '.png'))
        names.append(out)

    # baús: a face frontal montada a partir da textura da entidade (as faces estão de cabeça para baixo no atlas)
    for kind in ('normal', 'ender', 'trapped', 'christmas', 'copper'):
        im = Image.open(os.path.join(tex, 'entity', 'chest', kind + '.png')).convert('RGBA')
        icon = Image.new('RGBA', (16, 16))
        icon.paste(ImageOps.flip(im.crop((42, 14, 56, 19))), (1, 1))
        icon.paste(ImageOps.flip(im.crop((42, 33, 56, 43))), (1, 6))
        icon.paste(ImageOps.flip(im.crop((1, 1, 3, 5))), (7, 4))
        out = 'chest' if kind == 'normal' else kind + '_chest'
        icon.save(os.path.join(OUT, 'mc', 'item', out + '.png'))
        names.append(out)

    # alguns blocos também servem de emblema (a face da textura)
    for out, block in BLOCK_ICONS.items():
        Image.open(os.path.join(tex, 'block', block + '.png')).crop((0, 0, 16, 16)).save(
            os.path.join(OUT, 'mc', 'item', out + '.png'))
        names.append(out)

    with open(os.path.join(OUT, 'js', 'items.js'), 'w') as f:
        f.write('// gerado por tools/prepare_assets.py: todos os emblemas em mc/item/\n')
        f.write('const ITEM_NAMES = ' + json.dumps(sorted(names)) + ';\n')

    # tábuas de madeira + a cor média de cada uma (para a barra de status do Android combinar com o topo)
    woods = {}
    for wood in WOODS:
        im = Image.open(os.path.join(tex, 'block', wood + '_planks.png')).convert('RGB')
        im.save(os.path.join(OUT, 'mc', 'block', wood + '_planks.png'))
        woods[wood] = '#%02x%02x%02x' % im.resize((1, 1), Image.BOX).getpixel((0, 0))
    with open(os.path.join(OUT, 'js', 'items.js'), 'a') as f:
        f.write('const WOOD_COLORS = ' + json.dumps(woods) + ';\n')

    for name in BLOCKS:
        im = Image.open(os.path.join(tex, 'block', name + '.png'))
        if im.height > im.width:  # textura animada: só o primeiro quadro
            im = im.crop((0, 0, im.width, im.width))
        im.save(os.path.join(OUT, 'mc', 'block', name + '.png'))

    sprites = os.path.join(tex, 'gui', 'sprites')
    for out, rel in SPRITES.items():
        shutil.copy(os.path.join(sprites, rel), os.path.join(OUT, 'mc', 'gui', out + '.png'))

    # painel dos containers (baú, fornalha…): os cantos e bordas de generic_54.png num nine-slice de 12x12
    panel = Image.open(os.path.join(tex, 'gui', 'container', 'generic_54.png')).convert('RGBA').crop((0, 0, 176, 222))
    nine = Image.new('RGBA', (12, 12), panel.getpixel((8, 8)))
    w, h = panel.size
    nine.paste(panel.crop((0, 0, 4, 4)), (0, 0))
    nine.paste(panel.crop((w - 4, 0, w, 4)), (8, 0))
    nine.paste(panel.crop((0, h - 4, 4, h)), (0, 8))
    nine.paste(panel.crop((w - 4, h - 4, w, h)), (8, 8))
    nine.paste(panel.crop((8, 0, 12, 4)), (4, 0))
    nine.paste(panel.crop((8, h - 4, 12, h)), (4, 8))
    nine.paste(panel.crop((0, 8, 4, 12)), (0, 4))
    nine.paste(panel.crop((w - 4, 8, w, 12)), (8, 4))
    nine.save(os.path.join(OUT, 'mc', 'gui', 'panel.png'))

    # barra de atalhos com 5 espaços (a do jogo tem 9): borda esquerda + 5 espaços + borda direita
    hotbar = Image.open(os.path.join(sprites, 'hud', 'hotbar.png')).convert('RGBA')
    five = Image.new('RGBA', (1 + 5 * 20 + 1, 22))
    five.paste(hotbar.crop((0, 0, 101, 22)), (0, 0))
    five.paste(hotbar.crop((181, 0, 182, 22)), (101, 0))
    five.save(os.path.join(OUT, 'mc', 'gui', 'hotbar5.png'))

    for out, rel in SOUNDS.items():
        shutil.copy(os.path.join(mc, 'sounds', rel), os.path.join(OUT, 'sound', out + '.ogg'))

    build_font(mc, os.path.join(OUT, 'fonts', 'minecraft.ttf'))
    build_icons(os.path.join(OUT, 'mc', 'item', 'chest.png'), os.path.join(OUT, 'mc', 'item', 'emerald.png'),
                os.path.join(OUT, 'mc', 'block', 'grass_block_top.png'), os.path.join(OUT, 'mc', 'block', 'dirt.png'))
    print('ok:', len(names), 'itens,', len(BLOCKS), 'blocos')


def build_font(mc, path):
    """Monta uma TTF pixelada: cada pixel aceso do bitmap vira um quadrado de 128 unidades (8 pixels por em)."""
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    unit = 128
    providers = json.load(open(os.path.join(mc, 'font', 'include', 'default.json')))['providers']
    order = {'minecraft:font/ascii.png': 0, 'minecraft:font/accented.png': 1, 'minecraft:font/nonlatin_european.png': 2}
    providers.sort(key=lambda p: order.get(p.get('file'), 9))
    glyphs, seen = {}, set()
    for p in providers:
        if p.get('type') != 'bitmap' or p['file'] not in order:
            continue
        img = Image.open(os.path.join(mc, 'textures', p['file'].split(':')[1])).convert('RGBA')
        rows = p['chars']
        cw, ch = img.width // len(rows[0]), img.height // len(rows)
        ascent = p['ascent']
        for r, row in enumerate(rows):
            for c, char in enumerate(row):
                if char in seen or char in '\u0000 ':
                    continue
                cell = img.crop((c * cw, r * ch, c * cw + cw, r * ch + ch))
                px = cell.load()
                lit = [(x, y) for y in range(ch) for x in range(cw) if px[x, y][3] > 0]
                if not lit:
                    continue
                seen.add(char)
                glyphs[char] = (lit, max(x for x, _ in lit) + 1, ascent)

    names = ['.notdef', 'space']
    cmap = {32: 'space', 160: 'space', 0x202F: 'space'}
    advance = {'.notdef': (4 * unit, 0), 'space': (4 * unit, 0)}
    outlines = {}
    pen = TTGlyphPen(None)
    outlines['.notdef'] = pen.glyph()
    outlines['space'] = TTGlyphPen(None).glyph()
    for i, (char, (lit, width, ascent)) in enumerate(sorted(glyphs.items())):
        name = 'g%d' % i
        pen = TTGlyphPen(None)
        pixels = set(lit)
        for y in sorted({y for _, y in lit}):  # um retângulo por trecho horizontal aceso
            x = 0
            while x < width:
                if (x, y) in pixels:
                    x0 = x
                    while (x, y) in pixels:
                        x += 1
                    top, bottom = (ascent - y) * unit, (ascent - y - 1) * unit
                    pen.moveTo((x0 * unit, bottom))
                    pen.lineTo((x0 * unit, top))
                    pen.lineTo((x * unit, top))
                    pen.lineTo((x * unit, bottom))
                    pen.closePath()
                else:
                    x += 1
        outlines[name] = pen.glyph()
        names.append(name)
        cmap[ord(char)] = name
        advance[name] = ((width + 1) * unit, 0)

    fb = FontBuilder(1024, isTTF=True)
    fb.setupGlyphOrder(names)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(outlines)
    fb.setupHorizontalMetrics(advance)
    fb.setupHorizontalHeader(ascent=10 * unit, descent=-2 * unit)
    fb.setupNameTable({'familyName': 'Minecraft Bau', 'styleName': 'Regular'})
    fb.setupOS2(sTypoAscender=10 * unit, sTypoDescender=-2 * unit, usWinAscent=10 * unit, usWinDescent=2 * unit)
    fb.setupPost()
    fb.save(path)


def build_icons(chest, emerald, grass, dirt):
    """Ícone do app: baú sobre grama, ampliado sem suavização para cada densidade."""
    base = Image.new('RGBA', (24, 24))
    g, d = Image.open(grass).convert('RGBA'), Image.open(dirt).convert('RGBA')
    # a grama do jogo é cinza e tingida pelo bioma: aplica a cor das planícies
    r, gg, b, a = g.split()
    g = Image.merge('RGBA', (r.point(lambda v: v * 145 // 255), gg.point(lambda v: v * 189 // 255),
                             b.point(lambda v: v * 89 // 255), a))
    for x in (0, 16):
        w = 8 if x else 16
        base.paste(g.crop((0, 0, w, 16)), (x, 0))
        base.paste(d.crop((0, 0, w, 8)), (x, 16))
    base.alpha_composite(Image.open(chest).convert('RGBA'), (4, 4))
    em = Image.open(emerald).convert('RGBA').resize((8, 8), Image.NEAREST)
    base.alpha_composite(em, (14, 13))
    for density, size in (('mdpi', 48), ('hdpi', 72), ('xhdpi', 96), ('xxhdpi', 144), ('xxxhdpi', 192)):
        folder = os.path.join(RES, 'mipmap-' + density)
        os.makedirs(folder, exist_ok=True)
        base.resize((size, size), Image.NEAREST).save(os.path.join(folder, 'ic_launcher.png'))
    base.resize((96, 96), Image.NEAREST).save(os.path.join(OUT, 'mc', 'gui', 'logo.png'))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
