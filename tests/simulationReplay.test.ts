import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Simulation} from '../src/game/simulation';
import {EMPTY_INPUT} from '../src/game/types';
import {clearPathCache} from '../src/game/collision';

// Event streams plus final state/frame count from the first optimization pass.
// These guard against changes to collision, routing, RNG order and bot behavior.
const replays=[
 {teammates:2,enemies:3,seed:7,checksum:'e3a014ea6a07d299949854d1fb2e91fa234316685e0273f2319b45529eae5b81'},
 {teammates:2,enemies:3,seed:42,checksum:'775c00b1a4f7b649bd4e6c71cb3bc096751c7b5af93db4b495499994c66c6718'},
 {teammates:2,enemies:3,seed:2026,checksum:'3807871ded989d5879bc14c913b9289e49d023b3f6029e6956f9949f97d4c57f'},
 {teammates:4,enemies:5,seed:7,checksum:'7cc62c456a2d57ae33ac9c4c80c58205d1749bf2e268c524ff1b1d025718f55a'},
 {teammates:4,enemies:5,seed:42,checksum:'bb4991bd9e0b22de2fa37a648ac734d41a73db9e7e86c4f2b278856cd89b6da1'},
 {teammates:4,enemies:5,seed:2026,checksum:'ea75eead4b5ddbf84cc7a66e43e5868b0b7c766bf852edbb1900b5521563d116'},
];

for(const {teammates,enemies,seed,checksum} of replays){
 test(`full ${teammates+enemies+1}-bot replay preserves events and final state for seed ${seed}`,()=>{
  clearPathCache();
  const sim=new Simulation(seed),hash=createHash('sha256');
  sim.setBotCounts(teammates,enemies);sim.start();let frames=0;
  while(sim.state.phase!=='matchEnd'&&frames<60*600){
   sim.update(1/60,EMPTY_INPUT,true);
   hash.update(JSON.stringify(sim.events));sim.events.length=0;frames++;
  }
  assert.equal(sim.state.phase,'matchEnd');
  hash.update(JSON.stringify(sim.state));hash.update(String(frames));
  assert.equal(hash.digest('hex'),checksum);
 });
}
