"""Compare align-<page>.png screenshots (clean plate + all overlays) with the originals."""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
out = sys.argv[1]
man = json.load(open(os.path.join(ROOT, 'public', 'img', 'manifest.json')))
cfg = json.load(open(os.path.join(ROOT, 'tools', 'pages.json')))
src = {p['id']: p['src'] for p in cfg['pages']}
for pid in man['order']:
    shot = np.array(Image.open(os.path.join(out, 'align-%s.png' % pid)).convert('RGB')).astype(np.float32)
    orig = np.array(Image.open(os.path.join(ROOT, 'source', src[pid])).convert('RGB')).astype(np.float32)
    h = min(shot.shape[0], orig.shape[0]); w = min(shot.shape[1], orig.shape[1])
    d = np.abs(shot[:h, :w] - orig[:h, :w])
    mad = d.mean()
    # worst local error along overlay edges (visible seams)
    worst = 0.0
    for l in man['pages'][pid]['lines']:
        x, y, ww, hh = l['rect']
        X0, Y0 = int(x / 100 * w), int(y / 100 * h)
        X1, Y1 = int((x + ww) / 100 * w), int((y + hh) / 100 * h)
        band = np.concatenate([d[max(0, Y0 - 2):Y0 + 3, X0:X1].reshape(-1, 3), d[Y1 - 3:Y1 + 2, X0:X1].reshape(-1, 3),
                               d[Y0:Y1, max(0, X0 - 2):X0 + 3].reshape(-1, 3), d[Y0:Y1, X1 - 3:X1 + 2].reshape(-1, 3)])
        if len(band):
            worst = max(worst, float(band.mean()))
    print(pid, '%.3f' % mad, '%.2f' % worst)
