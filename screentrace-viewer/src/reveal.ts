/** Room left around an element that had to be scrolled into view. */
const MARGIN=24;

interface Box {top:number;bottom:number;left:number;right:number}

/** How far to scroll one axis: nothing when the target is already whole, else just enough to show it with a margin. */
function delta(start:number,end:number,viewStart:number,viewEnd:number):number{
 if(start>=viewStart&&end<=viewEnd)return 0;
 if(start<viewStart||end-start>viewEnd-viewStart-2*MARGIN)return start-viewStart-MARGIN;
 return end-viewEnd+MARGIN;
}

/** Scrolls one container so the box (in the container's own window coordinates) shows; returns how far it moved. */
function scrollBy(container:Element,box:Box,view:Box,behavior:ScrollBehavior){
 const top=delta(box.top,box.bottom,view.top,view.bottom),left=delta(box.left,box.right,view.left,view.right);
 const before={top:container.scrollTop,left:container.scrollLeft};
 if(top||left)container.scrollTo({top:before.top+top,left:before.left+left,behavior});
 // A smooth scroll has not moved yet; its destination is what the next container has to account for.
 return {top:behavior==='smooth'?top:container.scrollTop-before.top,left:behavior==='smooth'?left:container.scrollLeft-before.left};
}

const viewOf=(element:Element):Box=>{
 const r=element.getBoundingClientRect(),top=r.top+element.clientTop,left=r.left+element.clientLeft;
 return {top,left,bottom:top+element.clientHeight,right:left+element.clientWidth};
};

const scrolls=(element:Element)=>{
 const style=element.ownerDocument.defaultView!.getComputedStyle(element),open=(value:string)=>value==='auto'||value==='scroll';
 return (open(style.overflowY)&&element.scrollHeight>element.clientHeight)||(open(style.overflowX)&&element.scrollWidth>element.clientWidth);
};

/**
 * Brings an element of the preview into view the way the preview itself scrolls: its own scrolling areas, then
 * the preview's viewport. Unlike scrollIntoView it never moves anything outside the preview, such as the canvas.
 * An element already in full view stays put.
 */
export function revealInPreview(node:Element,frame:HTMLIFrameElement,viewport:Element|null,behavior:ScrollBehavior='auto'){
 const doc=node.ownerDocument;
 const r=node.getBoundingClientRect();
 let box:Box={top:r.top,bottom:r.bottom,left:r.left,right:r.right};
 const move=(moved:{top:number;left:number})=>{box={top:box.top-moved.top,bottom:box.bottom-moved.top,left:box.left-moved.left,right:box.right-moved.left};};
 for(let parent=node.parentElement;parent&&parent!==doc.documentElement&&parent!==doc.body;parent=parent.parentElement){
  if(scrolls(parent))move(scrollBy(parent,box,viewOf(parent),behavior));
 }
 const page=doc.scrollingElement;
 if(page&&(page.scrollHeight>page.clientHeight||page.scrollWidth>page.clientWidth))move(scrollBy(page,box,{top:0,left:0,bottom:page.clientHeight,right:page.clientWidth},behavior));
 if(!viewport)return;
 // The frame may be drawn scaled; place the box in the outer window to compare it with the viewport.
 const outer=frame.getBoundingClientRect(),scale=frame.offsetWidth?outer.width/frame.offsetWidth:1,x=outer.left+frame.clientLeft*scale,y=outer.top+frame.clientTop*scale;
 scrollBy(viewport,{top:y+box.top*scale,bottom:y+box.bottom*scale,left:x+box.left*scale,right:x+box.right*scale},viewOf(viewport),behavior);
}
