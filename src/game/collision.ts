import { MAP_BOXES } from './map';
import type {MapBox} from './types';
export const RADIUS=.32;
export function blocked(x:number,z:number,r=RADIUS,boxes=MAP_BOXES):boolean {
 for(const b of boxes){
  const dx=Math.max(Math.abs(x-b.x)-b.w/2,0);
  if(dx>=r)continue;
  const dz=Math.max(Math.abs(z-b.z)-b.d/2,0);
  if(dz>=r)continue;
  // Keep the exact circular corner test, but only for nearby boxes.
  if(Math.hypot(dx,dz)<r)return true;
 }
 return false;
}
export function moveBody(x:number,z:number,dx:number,dz:number,boxes=MAP_BOXES):{x:number;z:number} {
 const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.15));
 for(let i=0;i<steps;i++){if(!blocked(x+dx/steps,z,RADIUS,boxes))x+=dx/steps;if(!blocked(x,z+dz/steps,RADIUS,boxes))z+=dz/steps;}
 return {x,z};
}
export function rayBox(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number {
 let lo=0,hi=Infinity;
 // Keep the slab calculation scalar: this runs for every cover/hitbox probe.
 for(let i=0;i<3;i++){
  const origin=i===0?ox:i===1?oy:oz,direction=i===0?dx:i===1?dy:dz;
  const min=i===0?minX:i===1?minY:minZ,max=i===0?maxX:i===1?maxY:maxZ;
  if(Math.abs(direction)<1e-9){if(origin<min||origin>max)return Infinity;}
  else{let a=(min-origin)/direction,b=(max-origin)/direction;if(a>b){const swap=a;a=b;b=swap;}lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return Infinity;}
 }
 return hi<0?Infinity:lo;
}
export function wallDistance(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,boxes:MapBox[]=MAP_BOXES):number {
 let hit=Infinity;for(const b of boxes)hit=Math.min(hit,rayBox(ox,oy,oz,dx,dy,dz,b.x-b.w/2,0,b.z-b.d/2,b.x+b.w/2,b.h,b.z+b.d/2));return hit;
}
export function lineClear(x:number,z:number,tx:number,tz:number,height=1.5):boolean { const n=Math.hypot(tx-x,tz-z);return n<.01||wallDistance(x,height,z,(tx-x)/n,0,(tz-z)/n)>n-.1; }

// A 1 m navigation grid is rebuilt only once. Both paths and movement use the same cover proxies.
const MIN=-20, MAX=20, COLS=MAX-MIN+1;
const walkable=new Uint8Array(COLS*COLS);
for(let z=MIN;z<=MAX;z++)for(let x=MIN;x<=MAX;x++)walkable[(z-MIN)*COLS+x-MIN]=!blocked(x,z,.48)&&Math.abs(z)<19?1:0;
// Static topology and scratch storage are shared by synchronous path requests.
// Only the returned waypoints belong to the caller; no scratch buffers escape.
const neighbors=new Int32Array(walkable.length*4).fill(-1);
for(let cell=0;cell<walkable.length;cell++){
 const x=cell%COLS,z=Math.floor(cell/COLS),offset=cell*4;
 if(x+1<COLS&&walkable[cell+1])neighbors[offset]=cell+1;
 if(x>0&&walkable[cell-1])neighbors[offset+1]=cell-1;
 if(z+1<COLS&&walkable[cell+COLS])neighbors[offset+2]=cell+COLS;
 if(z>0&&walkable[cell-COLS])neighbors[offset+3]=cell-COLS;
}
const parents=new Int32Array(walkable.length),queue=new Int32Array(walkable.length);
function nearest(x:number,z:number):number {
 const nx=Math.round(x),nz=Math.round(z);
 // A free nearest lattice point needs no full-grid scan. Near ties use the
 // original scan so its row-major tie-breaking and float rounding are retained.
 if(nx>=MIN&&nx<=MAX&&nz>=MIN&&nz<=MAX&&Math.abs(x-nx)<.5-1e-10&&Math.abs(z-nz)<.5-1e-10){
  const cell=(nz-MIN)*COLS+nx-MIN;
  if(walkable[cell])return cell;
 }
 let best=-1,dist=Infinity;
 for(let i=0;i<walkable.length;i++){
  if(!walkable[i])continue;
  const d=(i%COLS+MIN-x)**2+(Math.floor(i/COLS)+MIN-z)**2;
  if(d<dist){dist=d;best=i;}
 }
 return best;
}

// Paths are determined entirely by this static grid and the two endpoint cells.
// Keep a bounded FIFO of cell indices; callers always receive fresh waypoints.
const PATH_CACHE_LIMIT=64,pathCache=new Map<number,Int16Array>();
/** Clear only computed routes, without rebuilding the static navigation grid. */
export function clearPathCache():void{pathCache.clear();}
function waypoints(cells:Int16Array):Array<{x:number;z:number}>{
 return Array.from(cells,cell=>({x:cell%COLS+MIN,z:Math.floor(cell/COLS)+MIN}));
}
export function findPath(x:number,z:number,tx:number,tz:number):Array<{x:number;z:number}> {
 const start=nearest(x,z),end=nearest(tx,tz);if(start<0||end<0)return [];
 const key=start*walkable.length+end,cached=pathCache.get(key);
 if(cached)return waypoints(cached);
 parents.fill(-1);queue[0]=start;parents[start]=start;let count=1;
 for(let i=0;i<count&&parents[end]===-1;i++){
  const cur=queue[i],offset=cur*4;
  for(let side=0;side<4;side++){
   const next=neighbors[offset+side];
   if(next!==-1&&parents[next]===-1){parents[next]=cur;queue[count++]=next;}
  }
 }
 const path:number[]=[];
 if(parents[end]!==-1)for(let at=end;at!==start;at=parents[at])path.push(at);
 path.reverse();const cells=Int16Array.from(path);
 if(pathCache.size===PATH_CACHE_LIMIT)pathCache.delete(pathCache.keys().next().value!);
 pathCache.set(key,cells);
 return waypoints(cells);
}
