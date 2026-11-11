// Curtain sway: the clean plate rendered as a WebGL texture and displaced gently
// inside the curtain mask. One shared context, attached to the settled page.
// The canvas is transparent outside the mask, so the crisp <img> shows through.
import { L } from '../layout.js';
import { asset } from '../stack.js';

const VERT = `
attribute vec2 a;
varying vec2 vUv;
void main() {
  vUv = vec2(a.x * 0.5 + 0.5, 0.5 - a.y * 0.5);
  gl_Position = vec4(a, 0.0, 1.0);
}`;

const MAX_RECTS = 8;
const FRAG = `
precision mediump float;
uniform sampler2D uImg;
uniform sampler2D uMask;
uniform float uT;
uniform float uAmp;
uniform float uSway;
uniform int uN;
uniform vec4 uRect[${MAX_RECTS}];   // chandelier rectangles (x0, x1, y0, y1) in uv
uniform vec2 uHang[${MAX_RECTS}];   // (bottom of that chandelier in uv, phase)
varying vec2 vUv;

float rectW(vec2 p, vec4 r) {
  float f = 0.018;
  float wx = smoothstep(r.x - f, r.x + f, p.x) * (1.0 - smoothstep(r.y - f, r.y + f, p.x));
  float wy = 1.0 - smoothstep(r.w - f * 1.5, r.w + f * 1.5, p.y);
  return wx * wy * step(r.z - 0.001, p.y);
}

void main() {
  vec2 uv = vUv;
  float m = texture2D(uMask, uv).r;
  // chandeliers: a slow pendulum hanging from the top of the page
  float cw = 0.0;
  float dx = 0.0;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uN) break;
    float w = rectW(uv, uRect[i]);
    if (w > cw) {
      cw = w;
      float hang = clamp(uv.y / max(uHang[i].x, 0.01), 0.0, 1.0);
      float ph = uHang[i].y;
      dx = (sin(uT * 0.95 + ph) * 0.8 + sin(uT * 0.41 + ph * 1.7) * 0.2) * uSway * hang;
    }
  }
  if (m < 0.004 && cw < 0.004) { gl_FragColor = vec4(0.0); return; }
  vec2 suv = uv;
  suv.x -= dx * cw;
  // curtains sway more toward their bottoms, as if they hang from the top
  suv.x += sin(uv.y * 18.0 + uT * 0.8 + uv.x * 6.0) * uAmp * m * smoothstep(0.0, 1.0, uv.y) * (1.0 - cw);
  vec4 c = texture2D(uImg, suv);
  // slow light sheen across the folds (±4% inside the curtain mask)
  float sheen = sin(uv.x * 26.0 - uT * 0.45 + sin(uv.y * 3.0 + uT * 0.21) * 1.7);
  c.rgb *= 1.0 + 0.04 * sheen * m * (1.0 - cw);
  float a = clamp(max(m, cw) * 1.6, 0.0, 1.0);
  gl_FragColor = vec4(c.rgb * a, a);
}`;

function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

export class CurtainRenderer {
  get background() { return true; }

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'curtain-gl';
    this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity .6s ease';
    let gl = null;
    try {
      gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch (e) { gl = null; }
    this.ok = !!gl;
    if (!gl) return;
    this.gl = gl;
    this.page = null;
    this.active = false;
    this.cache = new Map(); // page id -> { img, mask }
    this.t0 = performance.now();
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
      gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
      this.prog = p;
    } catch (e) {
      this.ok = false;
      return;
    }
    gl.useProgram(this.prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, 'a');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.uT = gl.getUniformLocation(this.prog, 'uT');
    this.uAmp = gl.getUniformLocation(this.prog, 'uAmp');
    this.uSway = gl.getUniformLocation(this.prog, 'uSway');
    this.uN = gl.getUniformLocation(this.prog, 'uN');
    this.uRect = gl.getUniformLocation(this.prog, 'uRect');
    this.uHang = gl.getUniformLocation(this.prog, 'uHang');
    this.clock = 0;
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uImg'), 0);
    gl.uniform1i(gl.getUniformLocation(this.prog, 'uMask'), 1);
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.disable('context lost'); });
    this.resize();
  }

  resize() {
    if (!this.ok) return;
    // up to 2x so the crystals stay crisp where the canvas covers the image
    const k = Math.min(window.devicePixelRatio || 1, 2);
    this.w = Math.round(L.plateW * k);
    this.h = Math.round(L.plateH * k);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.gl.viewport(0, 0, this.w, this.h);
    // textures are uploaded at canvas resolution; rebuild on the next attach
    for (const v of this.cache.values()) this.freeTex(v);
    this.cache.clear();
    if (this.page) { const p = this.page; this.page = null; this.attach(p); }
  }

  freeTex(v) {
    if (v.img) this.gl.deleteTexture(v.img);
    if (v.mask) this.gl.deleteTexture(v.mask);
  }

  makeTex(source, w, h) {
    const gl = this.gl;
    // pre-scale with the browser's high-quality resampler so GL samples ~1:1
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(source, 0, 0, w, h);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  async attach(page) {
    if (!this.ok || this.disabled) return;
    if (this.page === page) return;
    this.page = page;
    this.canvas.style.opacity = '0';
    const id = page.id;
    let entry = this.cache.get(id);
    if (!entry) {
      try {
        await (page.ready || Promise.resolve());
        const img = page.img;
        if (!img.complete || !img.naturalWidth) await new Promise((r) => img.addEventListener('load', r, { once: true }));
        const maskImg = await loadImg(asset(page.data.fxData.curtain));
        if (this.page !== page || this.disabled) return;
        entry = { img: this.makeTex(img, this.w, this.h), mask: this.makeTex(maskImg, Math.round(this.w / 2), Math.round(this.h / 2)) };
        this.cache.set(id, entry);
        // keep at most two pages of textures
        if (this.cache.size > 2) {
          for (const [k, v] of this.cache) {
            if (k !== id) { this.freeTex(v); this.cache.delete(k); break; }
          }
        }
      } catch (e) {
        return;
      }
    }
    if (this.page !== page) return;
    this.entry = entry;
    this.setSway(page.data.fxData.sway || []);
    page.plate.insertBefore(this.canvas, page.img.nextSibling);
    this.active = true;
    this.render(this.clock);
    requestAnimationFrame(() => { this.canvas.style.opacity = '1'; });
  }

  detach() {
    this.active = false;
    this.page = null;
    this.canvas.style.opacity = '0';
    if (this.canvas.parentNode) this.canvas.remove();
  }
  pause() { this.active = false; }
  resume() { if (this.entry && this.page) this.active = true; }

  disable(reason) {
    this.disabled = true;
    this.reason = reason;
    this.detach();
    document.documentElement.dataset.curtains = 'off:' + reason;
  }

  setSway(chandeliers) {
    const rects = new Float32Array(MAX_RECTS * 4);
    const hang = new Float32Array(MAX_RECTS * 2);
    let n = 0;
    for (const c of chandeliers) {
      for (const r of c.rects) {
        if (n >= MAX_RECTS) break;
        rects.set([r[0] / 100, r[1] / 100, r[2] / 100, r[3] / 100], n * 4);
        hang.set([c.bottom / 100, c.phase], n * 2);
        n++;
      }
    }
    this.swayN = n;
    this.swayRects = rects;
    this.swayHang = hang;
  }

  render(t) {
    const gl = this.gl;
    gl.uniform1i(this.uN, this.swayN || 0);
    if (this.swayN) {
      gl.uniform4fv(this.uRect, this.swayRects);
      gl.uniform2fv(this.uHang, this.swayHang);
    }
    gl.uniform1f(this.uSway, 0.0065);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.entry.img);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.entry.mask);
    gl.uniform1f(this.uT, t);
    gl.uniform1f(this.uAmp, 0.0045);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  update(t, dt) {
    if (!this.active || !this.entry || this.disabled) return;
    // own clock: it only advances while animating, so pausing during a scroll
    // never makes the chandeliers or curtains jump
    this.clock += Math.min(dt || 0.016, 0.05);
    this.render(this.clock);
    void t;
  }
}
