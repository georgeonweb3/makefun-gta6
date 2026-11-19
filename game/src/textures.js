// Procedural textures, drawn once on offscreen canvases at boot. No image
// files, no network: every facade, sign and road marking is generated here.
import * as THREE from 'three';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const PALETTES = [
  ['#e8d8b0', '#c96f4a', '#7fa8a0'], // warm stucco, terracotta, teal
  ['#f2e3c6', '#d98a5f', '#5f8fa8'],
  ['#e6cfa8', '#b85c48', '#8aa86b'],
  ['#efe0bb', '#a85f6e', '#6b7fa8'],
];

// A building facade: stucco base, rows of lit/unlit windows, a ground floor
// with shop awnings on some, and a roofline trim.
export function makeFacadeTexture(rng, palette, floors, shops) {
  return canvasTexture(256, 256, (g, w, h) => {
    const [base, accent, trim] = palette;
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // subtle stucco noise
    for (let i = 0; i < 900; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + rng() * 0.05})`;
      g.fillRect(rng() * w, rng() * h, 2, 2);
    }
    const rows = Math.max(2, floors);
    const cols = 4;
    const cw = w / cols, ch = (h - 40) / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22, y = 8 + r * ch + ch * 0.2;
        const ww = cw * 0.56, wh = ch * 0.55;
        const lit = rng() < 0.35;
        g.fillStyle = '#2c3540'; g.fillRect(x - 2, y - 2, ww + 4, wh + 4);
        g.fillStyle = lit ? (rng() < 0.5 ? '#ffd98a' : '#bfe6ff') : '#42566b';
        g.fillRect(x, y, ww, wh);
        g.fillStyle = 'rgba(255,255,255,.25)';
        g.fillRect(x, y, ww, 3);
      }
    }
    // ground floor: shops with awnings or a lobby door
    g.fillStyle = '#3a2f28'; g.fillRect(0, h - 40, w, 40);
    if (shops) {
      for (let c = 0; c < cols; c++) {
        g.fillStyle = c % 2 ? accent : trim;
        g.fillRect(c * cw + 4, h - 40, cw - 8, 14);
        g.fillStyle = '#ffe9a8';
        g.fillRect(c * cw + 8, h - 24, cw - 16, 20);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(c * cw + 8, h - 24, cw - 16, 3);
      }
    } else {
      g.fillStyle = '#20262e'; g.fillRect(w / 2 - 16, h - 38, 32, 38);
      g.fillStyle = '#ffd98a'; g.fillRect(w / 2 - 12, h - 34, 24, 10);
    }
    // roof trim
    g.fillStyle = trim; g.fillRect(0, 0, w, 6);
  });
}

export function makeRoofTexture(rng) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#8a7a66'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#7a6a58';
    for (let i = 0; i < 12; i++) g.fillRect(rng() * w, rng() * h, 14 + rng() * 20, 8 + rng() * 12);
    g.fillStyle = '#5d5347'; g.fillRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#6b7c8a'; g.fillRect(w * 0.3, h * 0.3, 18, 18); // AC unit
    g.fillStyle = '#4a4238'; g.fillRect(w * 0.6, h * 0.55, 10, 10);
  });
}

// Road surface with centre dashes and edge lines, tiled along the street.
export function makeRoadTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#33383e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(255,255,255,${rng01() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = '#e8c33a';
    g.fillRect(w / 2 - 2, 8, 4, 34);
    g.fillRect(w / 2 - 2, 74, 4, 34);
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillRect(4, 0, 3, h);
    g.fillRect(w - 7, 0, 3, h);
  });
}
function rng01() { return Math.random(); }

// Sidewalk / plaza paving.
export function makePavementTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#b8a98f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke();
      g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke();
    }
  });
}

// Sand for the beach.
export function makeSandTexture() {
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#e8d5a4'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(120,90,40,${0.05 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

// A shop / landmark sign board with original text.
export function makeSignTexture(text, sub, bg, fg) {
  return canvasTexture(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 54px Trebuchet MS, Verdana, sans-serif';
    g.fillText(text, w / 2, sub ? h / 2 - 16 : h / 2);
    if (sub) { g.font = 'bold 26px Trebuchet MS, Verdana, sans-serif'; g.fillText(sub, w / 2, h / 2 + 30); }
  });
}

// Billboard face (tall, seen from the road).
export function makeBillboardTexture(rng, lines, bg, fg) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = 'center';
    g.font = 'bold 64px Trebuchet MS, Verdana, sans-serif';
    g.fillText(lines[0], w / 2, 96);
    g.font = 'bold 34px Trebuchet MS, Verdana, sans-serif';
    g.fillText(lines[1], w / 2, 168);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = '22px Trebuchet MS, Verdana, sans-serif';
    g.fillText(lines[2] || '', w / 2, 214);
    // sun + palm silhouette deco
    g.fillStyle = '#ffd94a';
    g.beginPath(); g.arc(70, 60, 34, 0, Math.PI * 2); g.fill();
  });
}

export function facadePalette(rng) { return PALETTES[Math.floor(rng() * PALETTES.length)]; }
