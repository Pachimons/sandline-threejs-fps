import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Box3, Ray, Vector3} from 'three';
import {blocked, clearPathCache, findPath, rayBox} from '../src/game/collision';
import {MAP_BOXES} from '../src/game/map';
import type {MapBox} from '../src/game/types';

test('fast collision rejection preserves circular corners, tangencies and custom boxes', () => {
 const custom:MapBox[]=[{x:1.7,z:-2.3,w:2.4,d:3.8,h:2,kind:'wall'}];
 for(const boxes of [MAP_BOXES,custom])for(const radius of [0,.32,.48,1,-1,Infinity,NaN]){
  const points=Array.from({length:1000},(_,i)=>({x:Math.sin(i*1.3)*25,z:Math.cos(i*.71)*25}));
  for(const box of boxes)for(const angle of [0,Math.PI/4,Math.PI/2]){
   points.push({x:box.x+box.w/2+Math.cos(angle)*radius,z:box.z+box.d/2+Math.sin(angle)*radius});
  }
  for(const {x,z} of points){
   // Original circle/rectangle distance definition; independent of fast rejects.
   const expected=boxes.some(b=>Math.hypot(Math.max(Math.abs(x-b.x)-b.w/2,0),
    Math.max(Math.abs(z-b.z)-b.d/2,0))<radius);
   assert.equal(blocked(x,z,radius,boxes),expected,JSON.stringify({x,z,radius}));
  }
 }
});

test('ray/box hits agree with Three.js for outside and inside origins', () => {
 const bounds=new Box3(new Vector3(-4,0,-6),new Vector3(4,5,6));
 const hit=new Vector3();
 for(let i=0;i<5000;i++){
  const origin=new Vector3(i%23-11,(i%11)-3,i%31-15);
  const direction=new Vector3(Math.sin(i),Math.cos(i*.3)*.1,Math.cos(i)).normalize();
  const expected=new Ray(origin,direction).intersectBox(bounds,hit);
  const distance=rayBox(...origin.toArray() as [number,number,number],
   ...direction.toArray() as [number,number,number],-4,0,-6,4,5,6);
  if(bounds.containsPoint(origin))assert.equal(distance,0);
  else if(!expected)assert.equal(distance,Infinity);
  else assert.ok(Math.abs(distance-origin.distanceTo(expected))<1e-9,`ray ${i}`);
 }
});

test('parallel rays, boundary contacts and intersections behind the origin', () => {
 const box=[-1,-1,-1,1,1,1] as const;
 assert.equal(rayBox(2,0,0,0,0,-1,...box),Infinity);
 assert.equal(rayBox(1,0,3,0,0,-1,...box),2);
 assert.equal(rayBox(0,0,3,0,0,1,...box),Infinity);
 assert.equal(rayBox(0,0,0,0,0,-1,...box),0);
 assert.equal(rayBox(0,0,3,0,0,-2,...box),1);
 assert.equal(rayBox(0,0,3,1e-10,0,-1,...box),2);
});

test('navigation preserves baseline routes including ties, cover and out-of-map endpoints', () => {
 const routes=[
  [0,16,0,-16],[-21,19,21,-19],[3,10,3,16],[-9,0,10,0],
  [0,0,0,0],[100,100,-100,-100],[.5,.5,-.5,-.5],
 ];
 const paths=routes.map(r=>findPath(r[0],r[1],r[2],r[3]));
 // Recorded from upstream a68a2b0, before replacing the BFS scratch storage.
 assert.equal(createHash('sha256').update(JSON.stringify(paths)).digest('hex'),
  'f0ed9cc622053aba5a49efd9f4ca1522fe92875d91050546ffc80f0900d42be2');
 for(const path of paths)for(let i=0;i<path.length;i++){
  const p=path[i];assert.equal(blocked(p.x,p.z,.48),false);
  if(i>0)assert.equal(Math.abs(p.x-path[i-1].x)+Math.abs(p.z-path[i-1].z),1);
 }
 assert.equal(findPath(3,10,3,16).length,6,'open corridor takes a shortest route');
});

test('interleaved navigation requests cannot mutate earlier results or reuse stale parents', () => {
 const first=findPath(0,16,0,-16),saved=structuredClone(first);
 for(let i=0;i<100;i++){
  findPath(3,10,3,10);
  findPath(17,-16,-17,16);
 }
 assert.deepEqual(first,saved);
 first[0].x=999;
 assert.deepEqual(findPath(0,16,0,-16),saved);
});

test('cached, evicted and cleared routes stay identical and own their waypoint objects', () => {
 clearPathCache();
 const initial=findPath(0,16,0,-16),expected=structuredClone(initial);
 initial[0].x=999;
 assert.deepEqual(findPath(0,16,0,-16),expected,'cache hit returns fresh waypoints');
 for(let i=0;i<300;i++)findPath((i*7%43)-21,(i*11%39)-19,(i*13%43)-21,(i*17%39)-19);
 assert.deepEqual(findPath(0,16,0,-16),expected,'eviction cannot change the route');
 clearPathCache();
 assert.deepEqual(findPath(0,16,0,-16),expected,'explicit reset cannot change the route');
});

test('nearest endpoint shortcut matches a full-grid scan, including numerical ties', () => {
 const cells:Array<{x:number;z:number}>=[];
 for(let z=-20;z<=20;z++)for(let x=-20;x<=20;x++){
  if(!blocked(x,z,.48)&&Math.abs(z)<19)cells.push({x,z});
 }
 const targets=Array.from({length:500},(_,i)=>({x:Math.sin(i*1.3)*25,z:Math.cos(i*.71)*25}));
 for(const offset of [0,-1e-12,1e-12,-1e-8,1e-8])for(const x of [-17.5,-.5,.5,3.5,17.5]){
  targets.push({x:x+offset,z:10.5-offset});
 }
 for(const target of targets){
  let best=cells[0],distance=Infinity;
  for(const cell of cells){
   const d=(cell.x-target.x)**2+(cell.z-target.z)**2;
   if(d<distance){distance=d;best=cell;}
  }
  const path=findPath(3,16,target.x,target.z);
  assert.deepEqual(path.at(-1)??{x:3,z:16},best,JSON.stringify(target));
 }
});
