const { createCanvas } = require('canvas');
const fs = require('fs');

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Cream background
  ctx.fillStyle = '#f0e8d8';
  ctx.fillRect(0, 0, size, size);

  // Wave emoji ~15% of canvas
  const fontSize = Math.round(size * 0.15);
  ctx.font = `${fontSize}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Slightly above center
  const y = Math.round(size * 0.44);
  ctx.fillText('🌊', size / 2, y);

  return canvas.toBuffer('image/png');
}

fs.writeFileSync('/home/user/Tidal-Notes/icon-192.png', generateIcon(192));
console.log('icon-192.png done');
fs.writeFileSync('/home/user/Tidal-Notes/icon-512.png', generateIcon(512));
console.log('icon-512.png done');
