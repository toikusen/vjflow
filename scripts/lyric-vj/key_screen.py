"""The keying screen's measures, shared by key_sprites.py and key_frames.py: how far a pixel leans toward the screen
(green g - max(r, b), blue b - max(r, g), magenta min(r, b) - g; each ~110 on its own screen) and the despill that
takes that lean back out of the screen's channels. The screen is chosen per palette (chroma-screen.mts)."""

import numpy as np

SCREENS = ("green", "blue", "magenta")


def screen_excess(r, g, b, screen):
    if screen == "green":
        return g - np.maximum(r, b)
    if screen == "blue":
        return b - np.maximum(r, g)
    if screen == "magenta":
        return np.minimum(r, b) - g
    raise ValueError(f"unknown screen {screen}")


SCREEN_RGB = {"green": (0x00, 0xB1, 0x40), "blue": (0x00, 0x47, 0xBB), "magenta": (0xE0, 0x21, 0x8A)}


def despill(rgb, where, excess, screen):
    """Takes the screen back out of a pixel that leans toward it (excess > 0), where asked; returns a new array.
    The pixel is read as the figure's colour mixed with the screen and unmixed by the least share of screen that
    leaves it leaning nowhere (lean 0): white breath over green came out teal when only the green channel was
    lowered (the screen's blue stayed in it), and a share read off the lean alone overshot into pink at the breath's
    rim (大雪 S03, 2026-11-17)."""
    out = rgb.astype(np.float32)
    s = np.array(SCREEN_RGB[screen], np.float32)
    on = where & (excess > 0)
    unmix = lambda sh: (out - sh[..., None] * s) / (1 - sh[..., None])
    lean_of = lambda px: screen_excess(px[..., 0], px[..., 1], px[..., 2], screen)
    # the lean falls as the share grows: bisect for the share where it reaches 0 (at most 0.6, an edge, not a figure)
    lo = np.zeros(on.shape, np.float32)
    hi = np.where(on, 0.6, 0).astype(np.float32)
    for _ in range(14):
        mid = (lo + hi) / 2
        over = lean_of(unmix(mid)) > 0
        lo = np.where(over, mid, lo)
        hi = np.where(over, hi, mid)
    return np.clip(np.where(on[..., None], unmix(hi), out), 0, 255).astype(rgb.dtype)


def screen_alpha(r, g, b, screen):
    """Opacity from the lean: keyed where clearly the screen, a soft edge where it fades in. Dark ground shadows
    the model draws anyway go with a green screen (little red, green still leading); other screens keep dark inks."""
    excess = screen_excess(r, g, b, screen)
    alpha = np.clip(1 - (excess - 60) / 40, 0, 1)
    if screen == "green":
        alpha = np.where((r < 80) & (excess > 25), 0, alpha)
    return alpha, excess
