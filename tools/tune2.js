const { CAR_SPECS, createCarState, stepCar } = require('../src/physics.js');
const deg = (r) => (r * 180 / Math.PI).toFixed(0);
const scen = process.argv[2] || 'hold';
for (const key of Object.keys(CAR_SPECS)) for (const assist of [1, 0.6]) {
  const c = createCarState(CAR_SPECS[key], 0, 0, 0); const dt = 1/120; let t = 0;
  const samples = []; let spin = false;
  while (t < 16) {
    let inp = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    if (t > 3.5 && t < 3.9) { inp.steer = 1; inp.handbrake = 1; }
    else if (t >= 3.9 && t < 12) {
      if (scen === 'hold') { inp.steer = +process.argv[3] || 1; }
      else { const err = (-0.6) - c.slip; inp.steer = Math.max(-1, Math.min(1, -err * 3)); }
    } else if (t >= 12) { inp.steer = 0; inp.throttle = 0.4; }
    stepCar(c, inp, dt, assist); t += dt;
    if (t > 5 && t < 12) samples.push(c.slip);
    if (Math.abs(c.slip) > 1.9) spin = true;
  }
  const avg = samples.reduce((a,b)=>a+b,0)/samples.length;
  const mn = Math.min(...samples), mx = Math.max(...samples);
  console.log(`${scen} ${key} a=${assist} β avg=${deg(avg)} min=${deg(mn)} max=${deg(mx)} spin=${spin} end β=${deg(c.slip)} v=${(c.speed*3.6).toFixed(0)}`);
}
