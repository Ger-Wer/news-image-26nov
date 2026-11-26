// news-image-20261126: one procedural 1024x1024 PNG summing up 26 November 2026.
// Node >= 22, standard library only, ESM. Draws a newspaper page: masthead with
// the date, then five panels, one pictogram + two caption lines per story.
// Writes entry.png into process.env.MAKEFUN_OUTPUT_DIR (default /output).
// Deletes nothing, creates only the output dir if missing. Deterministic:
// same bytes on every run.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const W = 1024;
const H = 1024;
const buf = Buffer.alloc(W * H * 4);

// ---------- tiny PNG encoder: raw RGBA + zlib deflate + CRC32 ----------
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  crcTable[n] = c >>> 0;
}

function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const stride = 1 + W * 4;
  const raw = Buffer.alloc(H * stride);
  for (let y = 0; y < H; y++) {
    raw[y * stride] = 0; // filter: none
    buf.copy(raw, y * stride + 1, y * W * 4, (y + 1) * W * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
type RGB = [number, number, number];
const PAPER: RGB = [243, 238, 225];
const INK: RGB = [28, 26, 24];
const FAINT: RGB = [128, 120, 104];
const RED: RGB = [178, 46, 38];
const PANEL: RGB = [236, 230, 214];

// ---------- drawing primitives ----------
function px(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = c[0];
  buf[i + 1] = c[1];
  buf[i + 2] = c[2];
  buf[i + 3] = 255;
}

function rect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) px(i, j, c);
  }
}

function box(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  rect(x, y, w, t, c);
  rect(x, y + h - t, w, t, c);
  rect(x, y, t, h, c);
  rect(x + w - t, y, t, h, c);
}

function line(x0: number, y0: number, x1: number, y1: number, c: RGB, t = 1): void {
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    rect(x0, y0, t, t, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

// ---------- 5x7 pixel font, uppercase + a few marks ----------
// each glyph: 7 rows, 5 bits per row (bit 4 = leftmost pixel)
const G: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 27, 17],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [30, 1, 1, 14, 1, 1, 30],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  ':': [0, 12, 12, 0, 12, 12, 0],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '/': [1, 2, 2, 4, 8, 8, 16],
  '&': [12, 18, 20, 8, 21, 18, 13],
  '%': [25, 26, 2, 4, 8, 11, 19],
};

function text(x: number, y: number, s: string, c: RGB, scale = 1): void {
  for (let ch = 0; ch < s.length; ch++) {
    const glyph = G[s[ch]] ?? G['?'] ?? G[' '];
    for (let r = 0; r < 7; r++) {
      for (let b = 0; b < 5; b++) {
        if (glyph[r] & (1 << (4 - b))) rect(x + ch * 6 * scale + b * scale, y + r * scale, scale, scale, c);
      }
    }
  }
}

function textWidth(s: string, scale = 1): number {
  return s.length * 6 * scale - scale;
}

function textCenter(y: number, s: string, c: RGB, scale = 1): void {
  text(Math.floor((W - textWidth(s, scale)) / 2), y, s, c, scale);
}

// ---------- five pictograms, each inside a 132x132 cell ----------
// air base: five jets on a runway, each crossed out, with a rocket coming in
function drawAirBase(x: number, y: number): void {
  line(x + 8, y + 100, x + 124, y + 100, INK, 2);
  for (let k = 0; k < 5; k++) {
    const jx = x + 10 + k * 24;
    const jy = y + 84;
    rect(jx, jy + 8, 18, 3, INK);          // fuselage
    rect(jx + 14, jy + 2, 4, 6, INK);       // tail
    rect(jx + 6, jy + 11, 7, 2, INK);       // wing
    line(jx + 2, jy, jx + 17, jy + 13, RED, 2);   // X over it: damaged
    line(jx + 17, jy, jx + 2, jy + 13, RED, 2);
  }
  line(x + 12, y + 12, x + 48, y + 54, INK, 2);   // incoming rocket
  line(x + 48, y + 54, x + 39, y + 49, INK, 2);   // arrowhead
  line(x + 48, y + 54, x + 43, y + 62, INK, 2);
  line(x + 54, y + 62, x + 62, y + 72, RED, 2);   // impact flash
  line(x + 48, y + 64, x + 41, y + 72, RED, 2);
  line(x + 58, y + 58, x + 66, y + 62, RED, 2);
}

// NATO: shield outline with a five-pointed star
function drawNato(x: number, y: number): void {
  const cx = x + 66;
  rect(x + 30, y + 16, 72, 3, INK);
  rect(x + 30, y + 16, 3, 48, INK);
  rect(x + 99, y + 16, 3, 48, INK);
  line(x + 33, y + 63, cx, y + 108, INK, 3);
  line(x + 99, y + 63, cx, y + 108, INK, 3);
  for (let i = 0; i < 45; i++) {           // fill the shield body
    const hw = Math.round(33 * (44 - i) / 45);
    rect(cx - hw, y + 64 + i, hw * 2, 1, PANEL);
  }
  const pts: [number, number][] = [];
  for (let k = 0; k < 10; k++) {
    const r = k % 2 === 0 ? 24 : 10;
    const a = Math.PI / 2 + (k * Math.PI) / 5;
    pts.push([cx + Math.round(r * Math.cos(a)), y + 56 - Math.round(r * Math.sin(a))]);
  }
  for (let k = 0; k < 10; k++) line(pts[k][0], pts[k][1], pts[(k + 1) % 10][0], pts[(k + 1) % 10][1], INK, 2);
}

// tactical nuke: side-on missile with fins, exhaust dashes and a burst at the tip
function drawMissile(x: number, y: number): void {
  for (let i = 0; i < 20; i++) {
    const l = x + 16 + Math.round(12 * i / 19);
    rect(l, y + 56 + i, x + 28 - l, 1, INK);   // nose cone
  }
  rect(x + 28, y + 56, 62, 20, INK);            // body
  rect(x + 78, y + 42, 8, 14, INK);             // fins
  rect(x + 78, y + 76, 8, 14, INK);
  rect(x + 94, y + 58, 10, 2, FAINT);           // exhaust dashes
  rect(x + 100, y + 65, 10, 2, FAINT);
  rect(x + 94, y + 72, 10, 2, FAINT);
  line(x + 14, y + 66, x + 2, y + 56, RED, 2);  // burst rays at the tip
  line(x + 14, y + 66, x + 2, y + 76, RED, 2);
  line(x + 18, y + 54, x + 10, y + 44, RED, 2);
  line(x + 18, y + 78, x + 10, y + 88, RED, 2);
}

// markets: axes with a falling zigzag and an arrowhead
function drawChart(x: number, y: number): void {
  line(x + 26, y + 18, x + 26, y + 112, INK, 3);
  line(x + 26, y + 112, x + 120, y + 112, INK, 3);
  const zig: [number, number][] = [
    [34, 30], [52, 48], [66, 38], [88, 74], [102, 66], [116, 96],
  ];
  for (let k = 0; k + 1 < zig.length; k++) line(x + zig[k][0], y + zig[k][1], x + zig[k + 1][0], y + zig[k + 1][1], RED, 3);
  line(x + 116, y + 96, x + 107, y + 91, RED, 3);
  line(x + 116, y + 96, x + 112, y + 86, RED, 3);
}

// justice: a balance with two pans
function drawScales(x: number, y: number): void {
  rect(x + 44, y + 106, 44, 6, INK);            // base
  rect(x + 64, y + 26, 4, 80, INK);             // post
  rect(x + 62, y + 18, 8, 8, INK);              // finial
  rect(x + 26, y + 24, 80, 4, INK);             // beam
  for (const side of [0, 1]) {
    const cxp = side === 0 ? x + 30 : x + 102;
    line(cxp, y + 28, cxp - 14, y + 58, INK, 2);  // strings
    line(cxp, y + 28, cxp + 14, y + 58, INK, 2);
    line(cxp, y + 28, cxp, y + 58, INK, 2);
    for (let i = 0; i <= 7; i++) {              // pan: shallow bowl
      const hw = Math.round(18 * Math.sqrt(Math.max(0, 1 - (i / 8) * (i / 8))));
      rect(cxp - hw, y + 58 + i, hw * 2, 1, INK);
    }
  }
}

// ---------- the page ----------
const STORIES: { title: string; sub: string; draw: (x: number, y: number) => void }[] = [
  { title: 'UKRAINE HITS RUSSIAN AIR BASE', sub: '5 AIRCRAFT DAMAGED, 2 OIL PLANTS STRUCK', draw: drawAirBase },
  { title: 'NATO: PREPARE FOR LARGE-SCALE WAR', sub: 'SECRETARY-GENERAL RUTTE CALLS ON EUROPE', draw: drawNato },
  { title: 'KIM: MORE TACTICAL NUKES', sub: 'WIDER NUCLEAR DEPLOYMENT CALLED FOR', draw: drawMissile },
  { title: 'US STOCKS FALL ON AI FEARS', sub: 'S&P -2.2%, NASDAQ -3.2% IN AI JITTERS', draw: drawChart },
  { title: 'BIRTHRIGHT CITIZENSHIP BLOCKED', sub: "2ND JUDGE STOPS TRUMP'S BIRTHRIGHT ORDER", draw: drawScales },
];

function main(): void {
  rect(0, 0, W, H, PAPER);
  // masthead
  rect(28, 24, 968, 3, INK);
  rect(28, 31, 968, 1, INK);
  textCenter(46, 'WORLD NEWS', INK, 8);
  textCenter(116, 'THURSDAY 26 NOVEMBER 2026', FAINT, 3);
  rect(28, 150, 968, 2, INK);
  // five panels
  for (let k = 0; k < 5; k++) {
    const y0 = 164 + k * 162;
    if (k > 0) rect(28, y0 - 1, 968, 1, INK);
    rect(30, y0 + 17, 128, 128, PANEL);
    box(28, y0 + 15, 132, 132, INK, 2);
    STORIES[k].draw(32, y0 + 19);
    text(184, y0 + 52, (k + 1) + '.', RED, 3);   // story number
    text(228, y0 + 52, STORIES[k].title, INK, 3);
    text(228, y0 + 88, STORIES[k].sub, FAINT, 3);
  }
  // footer
  rect(28, 984, 968, 1, INK);
  textCenter(988, 'FIVE STORIES OF ONE DAY', FAINT, 2);
  const dir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'entry.png'), encodePng());
}

main();
