// Run with: node --import tsx scripts/benchmark-runtime.mjs
// CPU-only workloads; these numbers do not measure browser or GPU frame rate.
import {createHash} from 'node:crypto';
import * as collision from '../src/game/collision.ts';
const {blocked, findPath, rayBox}=collision;
import {Simulation} from '../src/game/simulation.ts';
import {EMPTY_INPUT} from '../src/game/types.ts';

function measure(name, run) {
  const expected = run(); // Warm up before timing; also check determinism.
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    const result = run();
    samples.push(performance.now() - start);
    if (result !== expected) throw new Error(`${name} produced a different result`);
  }
  samples.sort((a, b) => a - b);
  return {name, medianMs: +samples[2].toFixed(3), checksum: expected};
}

const reports = [
  measure('300 navigation requests', () => {
    collision.clearPathCache?.();
    const hash = createHash('sha256');
    for (let i = 0; i < 300; i++) {
      hash.update(JSON.stringify(findPath((i * 7 % 43) - 21, (i * 11 % 39) - 19,
        (i * 13 % 43) - 21, (i * 17 % 39) - 19)));
    }
    return hash.digest('hex');
  }),
  measure('100000 ray/box intersections', () => {
    let checksum = 0;
    for (let i = 0; i < 100000; i++) {
      const hit = rayBox(i % 23 - 11, 1.62, i % 31 - 15,
        Math.sin(i), Math.cos(i * .3) * .1, Math.cos(i), -4, 0, -6, 4, 5, 6);
      if (Number.isFinite(hit)) checksum += hit;
    }
    return checksum.toPrecision(16);
  }),
  measure('3600 simulation ticks, 6 bots', () => {
    collision.clearPathCache?.();
    const sim = new Simulation(42);
    sim.start();
    for (let i = 0; i < 3600; i++) {
      sim.update(1 / 60, EMPTY_INPUT, true);
      sim.events.length = 0;
    }
    return createHash('sha256').update(JSON.stringify(sim.state)).digest('hex');
  }),
  measure('20000 circle/box collision queries', () => {
    let hits=0;
    for(let i=0;i<20000;i++){
      if(blocked(Math.sin(i*1.3)*25,Math.cos(i*.71)*25,.32))hits++;
    }
    return String(hits);
  }),
  measure('3600 simulation ticks, 10 bots', () => {
    collision.clearPathCache?.();
    const sim=new Simulation(42);
    sim.setBotCounts(4,5);
    sim.start();
    for(let i=0;i<3600;i++){
      sim.update(1/60,EMPTY_INPUT,true);
      sim.events.length=0;
    }
    return createHash('sha256').update(JSON.stringify(sim.state)).digest('hex');
  }),
];
console.log(JSON.stringify({node: process.version, samples: 5, reports}, null, 2));
