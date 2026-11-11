"""Render assets/icon-180.png — a frosted-glass window tile for the plugin listing.

Design: warm-to-cool wallpaper gradient with soft colour blobs, covered by a
rounded "window" panel whose content is the blurred wallpaper plus a light
white tint — i.e. what Mica/Acrylic actually look like through the window.
Rendered at 4x and downsampled so the 96px storefront tile stays crisp.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).with_name("icon-180.png")
SIZE = 180
SS = 4  # supersample factor
S = SIZE * SS


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(size, top_left, bottom_right):
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(top_left, bottom_right, (x + y) / (2 * size - 2))
    return img


def blob(img, center, radius, color, alpha):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color + (alpha,))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    img.alpha_composite(layer)


def rounded_mask(size, box, radius):
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=radius, fill=255)
    return mask


def main():
    # --- wallpaper -------------------------------------------------------
    bg = gradient(S, (10, 26, 48), (16, 72, 92)).convert("RGBA")
    blob(bg, (S * 0.22, S * 0.20), S * 0.34, (122, 92, 255), 190)   # violet
    blob(bg, (S * 0.84, S * 0.30), S * 0.30, (56, 198, 216), 170)   # cyan
    blob(bg, (S * 0.62, S * 0.92), S * 0.36, (255, 107, 168), 130)  # pink
    bg = bg.filter(ImageFilter.GaussianBlur(S * 0.02))

    # --- window panel: blurred wallpaper + white tint = frosted glass ---
    inset = round(S * 0.115)
    box = (inset, inset, S - inset, S - inset)
    radius = round(S * 0.085)
    mask = rounded_mask(S, box, radius)

    frosted = bg.filter(ImageFilter.GaussianBlur(S * 0.11))
    tint = Image.new("RGBA", (S, S), (255, 255, 255, 34))
    frosted = Image.alpha_composite(frosted, tint)

    # specular sheen across the top-left of the glass, so the panel reads as
    # a lit surface rather than a flat border at 96px
    sheen = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    sd = ImageDraw.Draw(sheen)
    sd.polygon(
        [(0, 0), (S * 0.95, 0), (S * 0.35, S), (0, S)],
        fill=(255, 255, 255, 34),
    )
    sheen = sheen.filter(ImageFilter.GaussianBlur(S * 0.08))
    frosted = Image.alpha_composite(frosted, sheen)

    # soft drop shadow so the panel lifts off the wallpaper
    bg = Image.alpha_composite(bg, Image.new("RGBA", (S, S), (3, 8, 18, 70)))  # settle the wallpaper back
    shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    shadow.paste(Image.new("RGBA", (S, S), (4, 10, 20, 120)), (0, 0), mask)
    shadow = shadow.filter(ImageFilter.GaussianBlur(S * 0.035))
    canvas = Image.alpha_composite(bg, shadow)

    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    layer.paste(frosted, (0, 0), mask)
    canvas = Image.alpha_composite(canvas, layer)

    # --- window chrome: hairline edge + title-bar separator ------------
    # Draw the chrome on its own layer: ImageDraw replaces pixels instead of
    # alpha-blending them, so drawing straight onto the canvas would turn every
    # translucent white into solid white.
    chrome = ImageDraw.Draw(overlay := Image.new("RGBA", (S, S), (0, 0, 0, 0)))
    chrome.rounded_rectangle(box, radius=radius, outline=(255, 255, 255, 170), width=max(2, round(S * 0.006)))
    bar_y = box[1] + round((box[3] - box[1]) * 0.20)
    chrome.line(
        ((box[0] + round(S * 0.05)), bar_y, (box[2] - round(S * 0.05)), bar_y),
        fill=(255, 255, 255, 90),
        width=max(2, round(S * 0.005)),
    )
    for i in range(3):  # three window dots in the title bar
        cx = box[0] + round(S * 0.055) + i * round(S * 0.032)
        cy = (box[1] + bar_y) // 2
        r = max(2, round(S * 0.009))
        chrome.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 170))

    # a couple of content lines, so the tile reads as a window and not a blank card
    line_top = bar_y + round((box[3] - bar_y) * 0.18)
    line_h = max(3, round(S * 0.026))
    line_x = box[0] + round(S * 0.07)
    for i, (width, alpha) in enumerate(((0.58, 120), (0.42, 92), (0.30, 66))):
        y0 = line_top + i * round(S * 0.085)
        if y0 + line_h > box[3] - round(S * 0.06):
            break
        chrome.rounded_rectangle(
            (line_x, y0, box[0] + round((box[2] - box[0]) * width), y0 + line_h),
            radius=line_h // 2,
            fill=(255, 255, 255, alpha),
        )

    canvas = Image.alpha_composite(canvas, overlay)

    out = canvas.convert("RGB").resize((SIZE, SIZE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {SIZE}x{SIZE})")


if __name__ == "__main__":
    main()
