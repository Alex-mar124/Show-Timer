// Generates a minimal valid ICO file for Tauri builds
import { writeFileSync, mkdirSync } from 'fs';

function makeIco(size, bgra) {
  const pixelCount = size * size;

  // BITMAPINFOHEADER (40 bytes) — height doubled for ICO convention
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8);   // height x2 for ICO
  header.writeUInt16LE(1, 12);         // planes
  header.writeUInt16LE(32, 14);        // biBitCount
  header.writeUInt32LE(0, 16);         // compression
  header.writeUInt32LE(pixelCount * 4, 20);
  // rest is zero

  // Pixel data: rows stored bottom-up, BGRA
  const pixels = Buffer.alloc(pixelCount * 4);
  for (let row = size - 1; row >= 0; row--) {
    for (let col = 0; col < size; col++) {
      const i = ((size - 1 - row) * size + col) * 4;
      pixels[i]     = bgra[0]; // B
      pixels[i + 1] = bgra[1]; // G
      pixels[i + 2] = bgra[2]; // R
      pixels[i + 3] = bgra[3]; // A
    }
  }

  // AND mask: 4-byte aligned per row, all 0 = opaque
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const mask = Buffer.alloc(maskRowBytes * size, 0x00);

  const imageData = Buffer.concat([header, pixels, mask]);

  // ICONDIR (6 bytes)
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);
  iconDir.writeUInt16LE(1, 2); // type = ICO
  iconDir.writeUInt16LE(1, 4); // count

  // ICONDIRENTRY (16 bytes)
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 = 256
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(imageData.length, 8);
  entry.writeUInt32LE(22, 12); // 6 + 16

  return Buffer.concat([iconDir, entry, imageData]);
}

mkdirSync('src-tauri/icons', { recursive: true });

// Amber colour: BGRA = 0x0B, 0x9E, 0xF5, 0xFF  (#F59E0B)
const amber = [0x0B, 0x9E, 0xF5, 0xFF];

writeFileSync('src-tauri/icons/icon.ico', makeIco(32, amber));
writeFileSync('src-tauri/icons/32x32.png', makeIco(32, amber)); // placeholder, real PNG not needed for dev
writeFileSync('src-tauri/icons/128x128.png', makeIco(32, amber));

console.log('Icons generated.');
