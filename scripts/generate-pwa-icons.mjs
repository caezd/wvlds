// Régénère les icônes PWA (public/icons/*.png + app/apple-icon.png) à partir
// du logo app/icon.svg. À relancer si le logo change.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const LOGO_WHITE = "#FFFFFF";

const rawSvg = readFileSync(path.join(root, "app/icon.svg"), "utf-8");
const fixedColorSvg = rawSvg.replace(/currentColor/g, LOGO_WHITE);

async function logoBuffer(logoWidth) {
  return sharp(Buffer.from(fixedColorSvg), { density: 384 })
    .resize({ width: Math.round(logoWidth) })
    .png()
    .toBuffer();
}

async function composeOnSquare({ size, logoRatio, background }) {
  const logoWidth = size * logoRatio;
  const logo = await sharp(await logoBuffer(logoWidth)).toBuffer({ resolveWithObject: true });
  const canvas = sharp({
    create: { width: size, height: size, channels: 4, background },
  });
  return canvas
    .composite([
      {
        input: logo.data,
        left: Math.round((size - logo.info.width) / 2),
        top: Math.round((size - logo.info.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

const iconsDir = path.join(root, "public/icons");
mkdirSync(iconsDir, { recursive: true });

const dark = { r: 0x1b, g: 0x1b, b: 0x1d, alpha: 1 };

// Icônes "any" — fond sombre plein cadre (le logo a un tracé blanc,
// invisible en transparence sur les launchers/OS à thème clair).
for (const size of [192, 512]) {
  const buf = await composeOnSquare({ size, logoRatio: 0.62, background: dark });
  writeFileSync(path.join(iconsDir, `icon-${size}.png`), buf);
  console.log(`✓ public/icons/icon-${size}.png`);
}

// Icône maskable — fond opaque plein cadre, logo dans la safe zone (~50%
// pour survivre au rognage cercle/squircle d'Android).
{
  const buf = await composeOnSquare({ size: 512, logoRatio: 0.5, background: dark });
  writeFileSync(path.join(iconsDir, "maskable-512.png"), buf);
  console.log("✓ public/icons/maskable-512.png");
}

// apple-touch-icon — convention Next (app/apple-icon.png), fond opaque (iOS
// n'aime pas la transparence), pas de coins arrondis (iOS les applique).
{
  const buf = await composeOnSquare({ size: 180, logoRatio: 0.62, background: dark });
  writeFileSync(path.join(root, "app/apple-icon.png"), buf);
  console.log("✓ app/apple-icon.png");
}
