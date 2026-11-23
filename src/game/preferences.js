export const MIX = { volume: 80, engine: 100, turbo: 100, tires: 100, effects: 100, signals: 100, interface: 100 };

export const PROFILES = {
  low: { pr: 1, boost: 1, shadows: 0, smoke: 500, scenery: 0.45, reflections: 48 },
  med: { pr: 1.35, boost: 1, shadows: 0, smoke: 900, scenery: 0.75, reflections: 96 },
  high: { pr: 1.75, boost: 1, shadows: 1024, smoke: 1400, scenery: 1, reflections: 96 },
  ultra: { pr: 2.5, boost: 1.5, shadows: 2048, smoke: 2200, scenery: 1.45, reflections: 192 },
};

export const RANGE = {
  ...Object.fromEntries(Object.keys(MIX).map((key) => [key, [0, 100]])),
  renderScale: [50, 150],
  exposure: [65, 140],
  smokeAmount: [0, 150],
  fov: [45, 85],
  shake: [0, 100],
  stickDeadzone: [0, 35],
  stickSensitivity: [50, 150],
  vibration: [0, 100],
};
export const CHOICES = {
  quality: ['auto', ...Object.keys(PROFILES)],
  anisotropy: ['auto', '1', '2', '4', '8', '16'],
  shadows: ['auto', '0', '512', '1024', '2048', '4096'],
  scenery: ['auto', 'low', 'med', 'high', 'ultra'],
  reflections: ['auto', '48', '96', '192', '256'],
  fpsTarget: ['30', '45', '60'],
  speedUnit: ['kmh', 'mph'],
};

export function defaultSettings(reduce = false) {
  return {
    ...MIX,
    assist: 1,
    autoGas: false,
    sound: true,
    reduce,
    vibe: true,
    quality: 'auto',
    renderScale: 100,
    exposure: 100,
    smokeAmount: 100,
    shadows: 'auto',
    scenery: 'auto',
    reflections: 'auto',
    anisotropy: 'auto',
    fpsTarget: '60',
    fov: 54,
    shake: 100,
    minimap: true,
    speedUnit: 'kmh',
    stickDeadzone: 12,
    stickSensitivity: 110,
    vibration: 100,
  };
}

export function normalizeSettings(raw, reduce) {
  const result = defaultSettings(reduce);
  for (const [key, fallback] of Object.entries(result)) {
    const v = raw?.[key];
    if (RANGE[key] && Number.isFinite(v)) {
      const [min, max] = RANGE[key];
      result[key] = Math.max(min, Math.min(max, Math.round(v)));
    } else if (CHOICES[key]?.includes(v) || (key === 'assist' && [0, 1, 1.3, 1.35].includes(v))) {
      result[key] = v;
    } else if (typeof fallback === 'boolean' && typeof v === 'boolean') result[key] = v;
  }
  return result;
}

export function graphicsProfile(level, settings) {
  const base = PROFILES[level];
  return {
    ...base,
    anisotropy: settings.anisotropy === 'auto' ? (level === 'ultra' ? 16 : 8) : Number(settings.anisotropy),
    shadows: settings.shadows === 'auto' ? base.shadows : Number(settings.shadows),
    scenery: settings.scenery === 'auto' ? base.scenery : PROFILES[settings.scenery].scenery,
    reflections: settings.reflections === 'auto' ? base.reflections : Number(settings.reflections),
  };
}
