// Banc d'essai physique : ligne droite, lancer au frein à main, maintien au gaz, sortie.
const { CAR_SPECS, createCarState, stepCar } = require('../src/physics.js');
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
for (const key of Object.keys(CAR_SPECS)) {
  for (const assist of [1, 0]) {
    const c = createCarState(CAR_SPECS[key], 0, 0, 0);
    const dt = 1 / 120;
    let t = 0; const log = [];
    let maxB = 0, spun = false, driftTime = 0;
    while (t < 14) {
      let inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
      if (t > 4 && t < 4.5) { inp.steer = 1; inp.handbrake = 1; inp.throttle = 0.6; }
      else if (t >= 4.5 && t < 10) { inp.steer = 0.15; inp.throttle = 1; }
      else if (t >= 10) { inp.steer = 0; inp.throttle = 0.3; }
      stepCar(c, inp, dt, assist);
      t += dt;
      const b = Math.abs(c.slip);
      if (t > 4 && t < 10) { maxB = Math.max(maxB, b); if (b > 0.2 && c.fwd > 4) driftTime += dt; }
      if (b > 1.9) spun = true;
      if (Math.abs(t * 2 - Math.round(t * 2)) < dt) log.push(`${t.toFixed(1)}s v=${(c.speed * 3.6).toFixed(0)} β=${deg(c.slip)} ω=${c.omega.toFixed(2)} g=${c.gear} rpm=${c.rpm.toFixed(0)}`);
    }
    console.log(`== ${key} assist=${assist} maxβ=${deg(maxB)} drift=${driftTime.toFixed(1)}s spun=${spun} final β=${deg(c.slip)} v=${(c.speed * 3.6).toFixed(0)}`);
    if (process.argv[2] === key && +process.argv[3] === assist) console.log(log.join('\n'));
  }
}
