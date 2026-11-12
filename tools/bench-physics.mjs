// Banc physique (Node seul, sans navigateur) : ligne droite, lancer au frein à main, maintien, sortie.
// Sert de référence avant / après tout réglage de la physique : les chiffres ne doivent bouger que si on le veut.
//   node tools/bench-physics.mjs            lancer + maintien au gaz, par voiture et par niveau d'assistance
//   node tools/bench-physics.mjs hold 0.6   maintien volant braqué à 0,6
//   node tools/bench-physics.mjs angle      maintien d'un angle de 35° au volant
import { CAR_SPECS, createCarState, stepCar } from '../src/sim/physics.js';

const deg = (r) => ((r * 180) / Math.PI).toFixed(0);
const scen = process.argv[2] || 'launch';
const DT = 1 / 120;

for (const key of Object.keys(CAR_SPECS))
  for (const assist of scen === 'launch' ? [1, 0] : [1, 0.6]) {
    const c = createCarState(CAR_SPECS[key], 0, 0, 0);
    const slips = [];
    let t = 0,
      spun = false,
      drift = 0;
    const end = scen === 'launch' ? 14 : 16;
    while (t < end) {
      const inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
      if (scen === 'launch') {
        if (t > 4 && t < 4.5) Object.assign(inp, { steer: 1, handbrake: 1, throttle: 0.6 });
        else if (t >= 4.5 && t < 10) inp.steer = 0.15;
        else if (t >= 10) inp.throttle = 0.3;
      } else if (t > 3.5 && t < 3.9) Object.assign(inp, { steer: 1, handbrake: 1 });
      else if (t >= 3.9 && t < 12)
        inp.steer = scen === 'hold' ? +process.argv[3] || 1 : Math.max(-1, Math.min(1, -(-0.6 - c.slip) * 3));
      else if (t >= 12) inp.throttle = 0.4;
      stepCar(c, inp, DT, assist);
      t += DT;
      const b = Math.abs(c.slip);
      if (t > 5 && t < (scen === 'launch' ? 10 : 12)) {
        slips.push(c.slip);
        if (b > 0.2 && c.fwd > 4) drift += DT;
      }
      if (b > 1.9) spun = true;
    }
    const avg = slips.reduce((a, b) => a + b, 0) / slips.length;
    console.log(
      `${scen.padEnd(6)} ${key.padEnd(6)} assist ${assist} · β moyen ${deg(avg)}° min ${deg(Math.min(...slips))}° max ${deg(Math.max(...slips))}° · glisse ${drift.toFixed(1)} s · tête-à-queue ${spun ? 'oui' : 'non'} · fin β ${deg(c.slip)}° ${(c.speed * 3.6).toFixed(0)} km/h`,
    );
  }
