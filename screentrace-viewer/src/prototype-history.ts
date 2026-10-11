export interface Visit {screenId:string;scroll:number}
/** Simulation-only history. Never reads/writes browser history, storage, graph or review. */
export class PrototypeHistory {
 private visits:Visit[]=[];private cursor=-1;
 get current():Visit|undefined{return this.visits[this.cursor];}
 get trail():string[]{return this.visits.slice(0,this.cursor).map(v=>v.screenId);}
 restore(screenId:string,scroll=0){if(this.current)this.current.scroll=scroll;for(let i=this.cursor;i>=0;i--)if(this.visits[i].screenId===screenId){this.cursor=i;return;}}
 get canBack():boolean{return this.cursor>0;}
 get canForward():boolean{return this.cursor>=0&&this.cursor<this.visits.length-1;}
 start(screenId:string){this.visits=[{screenId,scroll:0}];this.cursor=0;}
 visit(screenId:string,scroll=0){if(this.cursor<0){this.start(screenId);return;}this.visits[this.cursor].scroll=scroll;if(this.current?.screenId===screenId)return;this.visits.splice(this.cursor+1);this.visits.push({screenId,scroll:0});this.cursor++;}
 move(delta:number,scroll=0):Visit|undefined{const next=this.cursor+delta;if(next<0||next>=this.visits.length)return;this.visits[this.cursor].scroll=scroll;this.cursor=next;return {...this.current!};}
 reset():Visit|undefined{const first=this.visits[0];if(!first)return;this.start(first.screenId);return {...this.current!};}
}
