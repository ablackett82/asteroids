// Rasterises a display list (src/render/screen.js) onto a Raster from png.js,
// for the icons and tools/shot.mjs: anti-aliased-ish thick lines, by distance
// from each segment.
export function drawLines(raster, segs, k, width, rgb, dots = []) {
  const plot = (x, y, a) => {
    if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return;
    const i = (y * raster.width + x) * 3, d = raster.data;
    for (let c = 0; c < 3; c++) d[i + c] = Math.max(d[i + c], Math.round(rgb[c] * a));
  };
  const hw = width / 2;
  for (let s = 0; s < segs.length; s += 5) {
    const x1 = segs[s] * k, y1 = segs[s + 1] * k, x2 = segs[s + 2] * k, y2 = segs[s + 3] * k, b = segs[s + 4];
    const minX = Math.floor(Math.min(x1, x2) - hw - 1), maxX = Math.ceil(Math.max(x1, x2) + hw + 1);
    const minY = Math.floor(Math.min(y1, y2) - hw - 1), maxY = Math.ceil(Math.max(y1, y2) + hw + 1);
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5, py = y + 0.5;
      const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
      const d = Math.hypot(px - x1 - t * dx, py - y1 - t * dy);
      if (d < hw + 0.5) plot(x, y, b * Math.min(1, hw + 0.5 - d));
    }
  }
  for (let i = 0; i < dots.length; i += 3) {
    const cx = dots[i] * k, cy = dots[i + 1] * k, r = Math.max(1, width);
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) plot(x, y, dots[i + 2]);
  }
}
