export const SKIN_WIDTH = 64;
export const SKIN_HEIGHT = 64;

export function getSkinRegions({ view = 'front', variant = 'classic', outerLayer = false } = {}) {
  const isSlim = variant === 'slim';
  const armW = isSlim ? 3 : 4;

  if (view === 'back') {
    const base = [
      { id: 'head', x: 4, y: 0, w: 8, h: 8, sx: 24, sy: 8, flipX: false },
      { id: 'body', x: 4, y: 8, w: 8, h: 12, sx: 32, sy: 20, flipX: false },
      // On back view, character's left arm is on viewer's left, right arm is on viewer's right
      { id: 'leftArm', x: 4 - armW, y: 8, w: armW, h: 12, sx: 40 + (isSlim ? 10 : 12), sy: 52, flipX: false, legacyFlip: true, legacySx: 44 + armW + 4, legacySy: 20 },
      { id: 'rightArm', x: 12, y: 8, w: armW, h: 12, sx: 44 + armW + 4, sy: 20, flipX: false },
      { id: 'leftLeg', x: 4, y: 20, w: 4, h: 12, sx: 28, sy: 52, flipX: false, legacyFlip: true, legacySx: 12, legacySy: 20 },
      { id: 'rightLeg', x: 8, y: 20, w: 4, h: 12, sx: 12, sy: 20, flipX: false },
    ];
    const overlay = [
      { id: 'hat', x: 4, y: 0, w: 8, h: 8, sx: 56, sy: 8, flipX: false },
      { id: 'jacket', x: 4, y: 8, w: 8, h: 12, sx: 32, sy: 36, flipX: false },
      { id: 'leftSleeve', x: 4 - armW, y: 8, w: armW, h: 12, sx: 56 + armW + 4, sy: 52, flipX: false },
      { id: 'rightSleeve', x: 12, y: 8, w: armW, h: 12, sx: 44 + armW + 4, sy: 36, flipX: false },
      { id: 'leftPants', x: 4, y: 20, w: 4, h: 12, sx: 12, sy: 52, flipX: false },
      { id: 'rightPants', x: 8, y: 20, w: 4, h: 12, sx: 12, sy: 36, flipX: false },
    ];
    return outerLayer ? { base, overlay } : { base, overlay: [] };
  }

  // Front view (mirroring Minecraft rendering: character right arm on viewer's left)
  const base = [
    { id: 'head', x: 4, y: 0, w: 8, h: 8, sx: 8, sy: 8, flipX: false },
    { id: 'body', x: 4, y: 8, w: 8, h: 12, sx: 20, sy: 20, flipX: false },
    { id: 'rightArm', x: 4 - armW, y: 8, w: armW, h: 12, sx: 44, sy: 20, flipX: false },
    { id: 'leftArm', x: 12, y: 8, w: armW, h: 12, sx: 36, sy: 52, flipX: false, legacyFlip: true, legacySx: 44, legacySy: 20 },
    { id: 'rightLeg', x: 4, y: 20, w: 4, h: 12, sx: 4, sy: 20, flipX: false },
    { id: 'leftLeg', x: 8, y: 20, w: 4, h: 12, sx: 20, sy: 52, flipX: false, legacyFlip: true, legacySx: 4, legacySy: 20 },
  ];

  const overlay = [
    { id: 'hat', x: 4, y: 0, w: 8, h: 8, sx: 40, sy: 8, flipX: false },
    { id: 'jacket', x: 4, y: 8, w: 8, h: 12, sx: 20, sy: 36, flipX: false },
    { id: 'rightSleeve', x: 4 - armW, y: 8, w: armW, h: 12, sx: 44, sy: 36, flipX: false },
    { id: 'leftSleeve', x: 12, y: 8, w: armW, h: 12, sx: 52, sy: 52, flipX: false },
    { id: 'rightPants', x: 4, y: 20, w: 4, h: 12, sx: 4, sy: 36, flipX: false },
    { id: 'leftPants', x: 8, y: 20, w: 4, h: 12, sx: 4, sy: 52, flipX: false },
  ];

  return outerLayer ? { base, overlay } : { base, overlay: [] };
}

export function drawSkinCharacter(ctx, img, {
  view = 'front',
  variant = 'classic',
  showOuterLayer = true,
  scale = 8,
  offsetX = 16,
  offsetY = 8,
} = {}) {
  if (!ctx || !img) return;
  const isLegacy64x32 = img.height === 32;
  const { base, overlay } = getSkinRegions({
    view,
    variant,
    outerLayer: showOuterLayer,
  });

  ctx.imageSmoothingEnabled = false;

  const drawPart = (part, isOverlay = false) => {
    if (isLegacy64x32 && isOverlay && part.id !== 'hat') return;
    let sx = part.sx;
    let sy = part.sy;
    let flip = Boolean(part.flipX);
    if (isLegacy64x32 && part.legacyFlip && part.legacySx !== undefined) {
      sx = part.legacySx;
      sy = part.legacySy;
      flip = true;
    }

    const dx = offsetX + part.x * scale;
    const dy = offsetY + part.y * scale;
    const dw = part.w * scale;
    const dh = part.h * scale;

    ctx.save();
    if (flip) {
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, part.w, part.h, 0, 0, dw, dh);
    } else {
      ctx.drawImage(img, sx, sy, part.w, part.h, dx, dy, dw, dh);
    }
    ctx.restore();
  };

  for (const part of base) drawPart(part, false);
  for (const part of overlay) drawPart(part, true);
}

export function mapPreviewPointToTexturePixel(px, py, {
  view = 'front',
  variant = 'classic',
  editOuterLayer = false,
  scale = 8,
  offsetX = 16,
  offsetY = 8,
} = {}) {
  const gx = Math.floor((px - offsetX) / scale);
  const gy = Math.floor((py - offsetY) / scale);
  const { base, overlay } = getSkinRegions({ view, variant, outerLayer: true });
  const pool = editOuterLayer ? overlay : base;

  for (const part of pool) {
    if (gx >= part.x && gx < part.x + part.w && gy >= part.y && gy < part.y + part.h) {
      return {
        tx: part.sx + (gx - part.x),
        ty: part.sy + (gy - part.y),
        partId: part.id,
      };
    }
  }
  return null;
}

export const BUILTIN_SKIN_PRESETS = [
  { id: 'steve', name: 'Steve Classic', variant: 'classic' },
  { id: 'alex', name: 'Alex Slim', variant: 'slim' },
  { id: 'tux', name: 'Monochrome Suit', variant: 'classic' },
  { id: 'knight', name: 'Obsidian Knight', variant: 'classic' },
];

function fillRect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function createPresetSkinDataUri(presetId = 'steve') {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const palettes = {
    steve: {
      skin: '#c69072', skinShade: '#ad7759', hair: '#3b2718', eyeWhite: '#ffffff', eyePupil: '#4947a6',
      shirt: '#00a6a6', shirtShade: '#008c8c', pants: '#3a327c', shoes: '#52525b',
    },
    alex: {
      skin: '#e7b999', skinShade: '#d09b79', hair: '#b85c27', eyeWhite: '#ffffff', eyePupil: '#3b7d3e',
      shirt: '#5a8f3d', shirtShade: '#487330', pants: '#4b3b2c', shoes: '#3f3f46',
    },
    tux: {
      skin: '#e4b89a', skinShade: '#c99878', hair: '#18181b', eyeWhite: '#fafafa', eyePupil: '#27272a',
      shirt: '#18181b', shirtShade: '#09090b', pants: '#18181b', shoes: '#09090b', tie: '#ffffff',
    },
    knight: {
      skin: '#52525b', skinShade: '#3f3f46', hair: '#18181b', eyeWhite: '#e4e4e7', eyePupil: '#e4e4e7',
      shirt: '#27272a', shirtShade: '#18181b', pants: '#1f1f24', shoes: '#09090b', visor: '#a1a1aa',
    },
  };

  const p = palettes[presetId] || palettes.steve;

  // Head box (0..32, 0..16)
  fillRect(ctx, 0, 0, 32, 16, p.skin);
  // Top & back hair
  fillRect(ctx, 8, 0, 8, 8, p.hair);
  fillRect(ctx, 24, 8, 8, 8, p.hair);
  fillRect(ctx, 0, 8, 8, 3, p.hair);
  fillRect(ctx, 16, 8, 8, 3, p.hair);
  // Front hair fringe (8,8..16,16)
  fillRect(ctx, 8, 8, 8, 2, p.hair);
  // Eyes
  fillRect(ctx, 9, 12, 1, 1, p.eyeWhite);
  fillRect(ctx, 10, 12, 1, 1, p.eyePupil);
  fillRect(ctx, 14, 12, 1, 1, p.eyeWhite);
  fillRect(ctx, 13, 12, 1, 1, p.eyePupil);
  // Nose / mouth subtle shading
  fillRect(ctx, 11, 13, 2, 1, p.skinShade);
  fillRect(ctx, 11, 15, 2, 1, p.skinShade);

  if (presetId === 'tux') {
    // Cool glasses on outer hat layer (40,8..48,16)
    fillRect(ctx, 41, 12, 2, 1, '#09090b');
    fillRect(ctx, 43, 12, 2, 1, '#27272a');
    fillRect(ctx, 45, 12, 2, 1, '#09090b');
  } else if (presetId === 'knight') {
    fillRect(ctx, 40, 8, 8, 3, '#3f3f46');
    fillRect(ctx, 40, 11, 1, 5, '#27272a');
    fillRect(ctx, 47, 11, 1, 5, '#27272a');
    fillRect(ctx, 40, 15, 8, 1, '#27272a');
  }

  // Body (16..40, 16..32)
  fillRect(ctx, 16, 16, 24, 16, p.shirt);
  fillRect(ctx, 20, 20, 8, 2, p.shirtShade);
  fillRect(ctx, 32, 20, 8, 2, p.shirtShade);
  if (p.tie) {
    fillRect(ctx, 23, 20, 2, 3, p.tie);
    fillRect(ctx, 23, 24, 2, 4, '#d4d4d8');
  } else if (p.visor) {
    fillRect(ctx, 22, 22, 4, 4, p.visor);
  }

  // Right Arm (40..56, 16..32) & Left Arm (32..48, 48..64)
  fillRect(ctx, 40, 16, 16, 6, p.shirt);
  fillRect(ctx, 40, 22, 16, 10, p.skin);
  fillRect(ctx, 32, 48, 16, 6, p.shirt);
  fillRect(ctx, 32, 54, 16, 10, p.skin);

  // Right Leg (0..16, 16..32) & Left Leg (16..32, 48..64)
  fillRect(ctx, 0, 16, 16, 13, p.pants);
  fillRect(ctx, 0, 29, 16, 3, p.shoes);
  fillRect(ctx, 16, 48, 16, 13, p.pants);
  fillRect(ctx, 16, 61, 16, 3, p.shoes);

  return canvas.toDataURL('image/png');
}
