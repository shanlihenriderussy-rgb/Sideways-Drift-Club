import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, graphicsProfile, normalizeSettings } from '../src/game/preferences.js';

test('les préférences historiques sont conservées et les nouveaux réglages reçoivent leurs valeurs par défaut', () => {
  const legacy = { sound: false, assist: 1.35, quality: 'high', autoGas: true, reduce: false };
  assert.deepEqual(normalizeSettings(legacy, true), { ...defaultSettings(true), ...legacy });
});

test('les données invalides sont écartées, les curseurs bornés et les choix graphiques respectés', () => {
  const settings = normalizeSettings({
    quality: 'ultra',
    engine: -5,
    fov: 100,
    exposure: Infinity,
    shadows: '0',
    reflections: '256',
    anisotropy: '24',
  });
  assert.equal(settings.engine, 0);
  assert.equal(settings.fov, 85);
  assert.equal(settings.exposure, 100);
  const graphics = graphicsProfile(settings.quality, settings);
  assert.equal(graphics.shadows, 0);
  assert.equal(graphics.reflections, 256);
  assert.equal(graphics.anisotropy, 16);
  assert.ok(graphics.scenery > graphicsProfile('high', settings).scenery);
});
