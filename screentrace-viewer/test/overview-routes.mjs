import assert from 'node:assert/strict';
/** Shared checks for overview routes: no run crosses a card other than its ends, and no two lines share a run. */
export function checkRoutes(layout,{card={width:250,height:220}}={}){
 for(const {relation:r,points} of layout.routes){
  for(const [id,p] of layout.positions){
   if(id===r.from||id===r.to)continue;
   for(let k=1;k<points.length;k++){const a=points[k-1],b=points[k];assert.ok(!(Math.max(a.x,b.x)>p.x&&Math.min(a.x,b.x)<p.x+card.width&&Math.max(a.y,b.y)>p.y&&Math.min(a.y,b.y)<p.y+card.height),`${r.from}->${r.to} crosses ${id}`);}
  }
  for(let k=1;k<points.length;k++){assert.ok(points[k].x===points[k-1].x||points[k].y===points[k-1].y,`${r.from}->${r.to} is orthogonal`);assert.notDeepEqual(points[k],points[k-1]);}
 }
 const runs=layout.routes.flatMap(({relation:r,points})=>points.slice(1).map((b,k)=>({r,a:points[k],b})));
 for(let i=0;i<runs.length;i++)for(let j=i+1;j<runs.length;j++){
  const p=runs[i],q=runs[j];if(p.r===q.r)continue;
  const vertical=p.a.x===p.b.x&&q.a.x===q.b.x&&p.a.x===q.a.x,horizontal=p.a.y===p.b.y&&q.a.y===q.b.y&&p.a.y===q.a.y;
  const overlap=(lo1,hi1,lo2,hi2)=>Math.min(hi1,hi2)-Math.max(lo1,lo2)>1;
  if(vertical)assert.ok(!overlap(Math.min(p.a.y,p.b.y),Math.max(p.a.y,p.b.y),Math.min(q.a.y,q.b.y),Math.max(q.a.y,q.b.y)),`${p.r.from}->${p.r.to} overlaps ${q.r.from}->${q.r.to}`);
  if(horizontal)assert.ok(!overlap(Math.min(p.a.x,p.b.x),Math.max(p.a.x,p.b.x),Math.min(q.a.x,q.b.x),Math.max(q.a.x,q.b.x)),`${p.r.from}->${p.r.to} overlaps ${q.r.from}->${q.r.to}`);
 }
}
