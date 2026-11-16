import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

const BUNDLE_IDENTIFIER = 'com.cursada.app';
const APP_DISPLAY_NAME = 'Cursada';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const crcInput = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function clamp01(value) {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function smoothCoverage(signedDistancePx) {
  // Smooth 1px anti-aliased alpha transition around the boundary (sd = 0)
  return clamp01(0.5 - signedDistancePx);
}

function blendOver(dstR, dstG, dstB, dstA, srcR, srcG, srcB, srcA) {
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 1e-6) {
    return [0, 0, 0, 0];
  }
  const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
  const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
  const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;
  return [outR, outG, outB, outA];
}

/**
 * Generates a valid RGBA PNG buffer containing the Cursada macOS squircle icon
 * matching build/icon-dark.svg: #1E2023 graphite squircle, crisp white "C" arc,
 * and coral accent dot (#FF5F52).
 *
 * @param {number} [size=1024]
 * @returns {Buffer}
 */
export function generateIconPngBuffer(size = 1024) {
  if (!Number.isInteger(size) || size < 16) {
    throw new Error(`Tamaño de ícono inválido: ${String(size)}. Debe ser un entero >= 16.`);
  }

  const rowStride = 1 + size * 4;
  const raw = Buffer.alloc(rowStride * size);
  const pixelScale = 1024 / size;

  // Full-bleed macOS squircle aligned with build/icon-dark.svg (1024x1024, rx=230)
  const halfBox = 512;
  const cornerRadius = 230;
  const innerBox = halfBox - cornerRadius;

  // Transformed coordinates matching transform="translate(512 512) scale(7.9) translate(-48.25 -50)"
  const logoScale = 7.9;
  const cCenterX = 512 + logoScale * (44 - 48.25);
  const cCenterY = 512;
  const cRadius = 26 * logoScale;
  const cHalfStroke = 6 * logoScale;
  const gapAngle = 0.7;

  const dotCenterX = 512 + logoScale * (77 - 48.25);
  const dotCenterY = 512 + logoScale * (70 - 50);
  const dotRadius = 7.5 * logoScale;

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * rowStride;
    raw[rowOffset] = 0; // PNG filter type 0 (None)

    const v = (y + 0.5) / size;
    const py = v * 1024;
    const qy = Math.abs(py - 512) - innerBox;
    const dyC = py - cCenterY;

    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size;
      const px = u * 1024;

      // Signed distance to macOS squircle
      const qx = Math.abs(px - 512) - innerBox;
      const sdSquircle =
        (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) -
          cornerRadius) /
        pixelScale;

      const bgAlpha = smoothCoverage(sdSquircle);
      if (bgAlpha <= 0) {
        const pxOffset = rowOffset + 1 + x * 4;
        raw[pxOffset] = 0;
        raw[pxOffset + 1] = 0;
        raw[pxOffset + 2] = 0;
        raw[pxOffset + 3] = 0;
        continue;
      }

      // Solid Swiss graphite background (#1E2023)
      let r = 30;
      let g = 32;
      let b = 35;
      let a = bgAlpha;

      // Geometric anti-aliased letter "C" (#FFFFFF)
      const dxC = px - cCenterX;
      const distC = Math.hypot(dxC, dyC);
      const theta = Math.atan2(dyC, dxC);
      const sdC =
        Math.abs(theta) >= gapAngle
          ? (Math.abs(distC - cRadius) - cHalfStroke) / pixelScale
          : 100;

      const cCov = Math.min(bgAlpha, smoothCoverage(sdC));
      if (cCov > 0) {
        [r, g, b, a] = blendOver(r, g, b, a, 255, 255, 255, cCov);
      }

      // Coral Swiss period accent (#FF5F52)
      const sdDot = (Math.hypot(px - dotCenterX, py - dotCenterY) - dotRadius) / pixelScale;
      const dotCov = Math.min(bgAlpha, smoothCoverage(sdDot));
      if (dotCov > 0) {
        [r, g, b, a] = blendOver(r, g, b, a, 255, 95, 82, dotCov);
      }

      const pxOffset = rowOffset + 1 + x * 4;
      raw[pxOffset] = Math.round(clamp01(r / 255) * 255);
      raw[pxOffset + 1] = Math.round(clamp01(g / 255) * 255);
      raw[pxOffset + 2] = Math.round(clamp01(b / 255) * 255);
      raw[pxOffset + 3] = Math.round(clamp01(a) * 255);
    }
  }

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8; // Bit depth: 8
  ihdrData[9] = 6; // Color type: RGBA
  ihdrData[10] = 0; // Compression method
  ihdrData[11] = 0; // Filter method
  ihdrData[12] = 0; // Interlace method

  const compressedData = zlib.deflateSync(raw);

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk('IHDR', ihdrData),
    createPngChunk('IDAT', compressedData),
    createPngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONSET_ENTRIES = [
  [16, 'icon_16x16.png', 'icp4'],
  [32, 'icon_16x16@2x.png', 'ic11'],
  [32, 'icon_32x32.png', 'icp5'],
  [64, 'icon_32x32@2x.png', 'ic12'],
  [128, 'icon_128x128.png', 'ic07'],
  [256, 'icon_128x128@2x.png', 'ic13'],
  [256, 'icon_256x256.png', 'ic08'],
  [512, 'icon_256x256@2x.png', 'ic14'],
  [512, 'icon_512x512.png', 'ic09'],
  [1024, 'icon_512x512@2x.png', 'ic10'],
];

function writeIcnsFromIconset(iconsetDir, targetIcnsPath) {
  const chunks = [];
  for (const [, filename, osType] of ICONSET_ENTRIES) {
    const pngBuffer = fs.readFileSync(path.join(iconsetDir, filename));
    const chunkHeader = Buffer.alloc(8);
    chunkHeader.write(osType, 0, 4, 'ascii');
    chunkHeader.writeUInt32BE(8 + pngBuffer.length, 4);
    chunks.push(chunkHeader, pngBuffer);
  }
  const body = Buffer.concat(chunks);
  const fileHeader = Buffer.alloc(8);
  fileHeader.write('icns', 0, 4, 'ascii');
  fileHeader.writeUInt32BE(8 + body.length, 4);
  fs.writeFileSync(targetIcnsPath, Buffer.concat([fileHeader, body]));
}

/**
 * Generates build/icon.png (1024x1024) and, on macOS, build/icon.icns using
 * native sips and iconutil (with pure-Node ICNS container fallback if iconutil
 * is restricted by a sandboxed environment).
 */
export function ensureMacOsIcons(projectRoot, options = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const buildDir = path.join(resolvedRoot, 'build');
  fs.mkdirSync(buildDir, { recursive: true });

  const iconSize = options.size ?? 1024;
  const iconPngPath = path.join(buildDir, 'icon.png');
  const iconBuffer = generateIconPngBuffer(iconSize);
  fs.writeFileSync(iconPngPath, iconBuffer);

  let iconIcnsPath = null;
  if (process.platform === 'darwin' && !options.skipIcns) {
    const targetIcnsPath = path.join(buildDir, 'icon.icns');
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cursada-iconset-'));
    const iconsetDir = path.join(tempRoot, 'Cursada.iconset');

    try {
      fs.mkdirSync(iconsetDir, { recursive: true });
      for (const [px, filename] of ICONSET_ENTRIES) {
        const destFile = path.join(iconsetDir, filename);
        if (px === iconSize) {
          fs.copyFileSync(iconPngPath, destFile);
        } else {
          execFileSync(
            '/usr/bin/sips',
            ['-z', String(px), String(px), iconPngPath, '--out', destFile],
            { stdio: 'pipe' }
          );
        }
      }

      try {
        execFileSync(
          '/usr/bin/iconutil',
          ['-c', 'icns', iconsetDir, '-o', targetIcnsPath],
          { stdio: 'pipe' }
        );
      } catch {
        writeIcnsFromIconset(iconsetDir, targetIcnsPath);
      }
      iconIcnsPath = targetIcnsPath;
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  return {
    iconPngPath,
    iconIcnsPath,
  };
}

function updateInfoPlist(infoPlistPath, version) {
  if (process.platform !== 'darwin' || !fs.existsSync(infoPlistPath)) {
    return;
  }

  try {
    execFileSync(
      '/usr/bin/plutil',
      ['-remove', 'ElectronAsarIntegrity', infoPlistPath],
      { stdio: 'pipe' }
    );
  } catch {
    // ElectronAsarIntegrity may not exist on custom or minimal Info.plist files
  }

  const plistReplacements = [
    ['CFBundleName', APP_DISPLAY_NAME],
    ['CFBundleDisplayName', APP_DISPLAY_NAME],
    ['CFBundleIdentifier', BUNDLE_IDENTIFIER],
    ['CFBundleShortVersionString', version],
    ['CFBundleVersion', version],
    ['CFBundleIconFile', 'Cursada.icns'],
    ['LSApplicationCategoryType', 'public.app-category.education'],
  ];

  for (const [key, value] of plistReplacements) {
    execFileSync(
      '/usr/bin/plutil',
      ['-replace', key, '-string', value, infoPlistPath],
      { stdio: 'pipe' }
    );
  }
}

/**
 * Packages Cursada.app into outputDir/Cursada.app from compiled dist/ and
 * dist-electron/ artifacts using the local Electron.app bundle.
 */
export function packageMacOsApp(options = {}) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = path.resolve(
    options.projectRoot ?? path.resolve(scriptDir, '..')
  );
  const outputDir = path.resolve(
    options.outputDir ?? path.join(projectRoot, 'release')
  );
  const electronAppPath = path.resolve(
    options.electronAppPath ??
      path.join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app')
  );
  const skipIcons = options.skipIcons ?? false;
  const skipCodesign = options.skipCodesign ?? false;

  const distDir = path.join(projectRoot, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const distElectronDir = path.join(projectRoot, 'dist-electron');
  const distMainPath = path.join(distElectronDir, 'main.js');
  const packageJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(distIndexPath)) {
    throw new Error(
      `No se encontró el build de frontend en "${distIndexPath}". Ejecutá "npm run build" primero.`
    );
  }
  if (!fs.existsSync(distMainPath)) {
    throw new Error(
      `No se encontró el build de Electron en "${distMainPath}". Ejecutá "npm run build" primero.`
    );
  }
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No se encontró package.json en "${packageJsonPath}".`);
  }
  if (!fs.existsSync(electronAppPath)) {
    throw new Error(
      `No se encontró Electron.app en "${electronAppPath}". Verificá que las dependencias estén instaladas.`
    );
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const version = typeof pkg.version === 'string' && pkg.version.trim()
    ? pkg.version.trim()
    : '0.1.0';

  const appPath = path.join(outputDir, 'Cursada.app');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(appPath, { recursive: true, force: true });

  fs.cpSync(electronAppPath, appPath, {
    recursive: true,
    verbatimSymlinks: true,
  });

  const contentsDir = path.join(appPath, 'Contents');
  const resourcesDir = path.join(contentsDir, 'Resources');
  const bundledAppDir = path.join(resourcesDir, 'app');

  fs.mkdirSync(bundledAppDir, { recursive: true });
  fs.cpSync(distDir, path.join(bundledAppDir, 'dist'), { recursive: true });
  fs.cpSync(distElectronDir, path.join(bundledAppDir, 'dist-electron'), {
    recursive: true,
  });

  const minimalPkg = {
    name: pkg.name ?? 'cursada',
    version,
    description:
      pkg.description ?? 'Espacio de trabajo académico local para macOS',
    type: pkg.type ?? 'module',
    main: pkg.main ?? 'dist-electron/main.js',
  };
  fs.writeFileSync(
    path.join(bundledAppDir, 'package.json'),
    `${JSON.stringify(minimalPkg, null, 2)}\n`,
    'utf8'
  );

  const defaultAsarPath = path.join(resourcesDir, 'default_app.asar');
  if (fs.existsSync(defaultAsarPath)) {
    fs.rmSync(defaultAsarPath, { force: true });
  }

  const infoPlistPath = path.join(contentsDir, 'Info.plist');
  updateInfoPlist(infoPlistPath, version);

  // The app icon is rendered from build/icon-dark.svg by scripts/build-icons.sh.
  const iconPngPath = path.join(projectRoot, 'build', 'icon.png');
  const iconIcnsPath = path.join(projectRoot, 'build', 'icon.icns');

  if (!skipIcons && !fs.existsSync(iconIcnsPath)) {
    throw new Error(
      `No se encontró el ícono en "${iconIcnsPath}". Ejecutá "bash scripts/build-icons.sh" primero.`
    );
  }

  if (fs.existsSync(iconIcnsPath)) {
    fs.copyFileSync(iconIcnsPath, path.join(resourcesDir, 'Cursada.icns'));
    fs.copyFileSync(iconIcnsPath, path.join(resourcesDir, 'electron.icns'));
  }

  if (fs.existsSync(iconPngPath)) {
    fs.copyFileSync(iconPngPath, path.join(resourcesDir, 'icon.png'));
  }

  if (!skipCodesign && process.platform === 'darwin') {
    execFileSync(
      '/usr/bin/codesign',
      ['--force', '--deep', '--sign', '-', appPath],
      { stdio: 'pipe' }
    );
  }

  return {
    appPath,
    bundleIdentifier: BUNDLE_IDENTIFIER,
    iconIcnsPath: fs.existsSync(iconIcnsPath) ? iconIcnsPath : null,
    iconPngPath: fs.existsSync(iconPngPath) ? iconPngPath : null,
  };
}

const isExecutedDirectly =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isExecutedDirectly) {
  const result = packageMacOsApp();
  console.log(`Cursada.app empaquetada en: ${result.appPath}`);
}
