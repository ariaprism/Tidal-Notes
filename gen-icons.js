const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  const s = size;

  // Warm cream background
  ctx.fillStyle = '#f0e8d8';
  ctx.fillRect(0, 0, s, s);

  // Brown circle backdrop
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s * 0.38, 0, Math.PI * 2);
  ctx.fillStyle = '#6b4a2a';
  ctx.fill();

  // Wave — three arches drawn with bezier curves, centered
  const cx = s / 2;
  const cy = s / 2 + s * 0.04;
  const ww = s * 0.44;   // total wave width
  const wh = s * 0.10;   // arch height
  const lw = s * 0.055;  // line width

  ctx.beginPath();
  ctx.moveTo(cx - ww / 2, cy);

  // three arches (up-down-up pattern)
  const seg = ww / 3;
  ctx.bezierCurveTo(
    cx - ww / 2 + seg * 0.25, cy - wh,
    cx - ww / 2 + seg * 0.75, cy - wh,
    cx - ww / 2 + seg,        cy
  );
  ctx.bezierCurveTo(
    cx - ww / 2 + seg * 1.25, cy + wh,
    cx - ww / 2 + seg * 1.75, cy + wh,
    cx - ww / 2 + seg * 2,    cy
  );
  ctx.bezierCurveTo(
    cx - ww / 2 + seg * 2.25, cy - wh,
    cx - ww / 2 + seg * 2.75, cy - wh,
    cx - ww / 2 + seg * 3,    cy
  );

  ctx.strokeStyle = '#f0e8d8';
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();

  return canvas.toBuffer('image/png');
}

fs.writeFileSync('./icon-192.png', generateIcon(192));
console.log('icon-192.png done');
fs.writeFileSync('./icon-512.png', generateIcon(512));
console.log('icon-512.png done');
