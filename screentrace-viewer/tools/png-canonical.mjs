import {deflateSync,inflateSync} from 'node:zlib';

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const crcTable=Uint32Array.from({length:256},(_,value)=>{let crc=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);return crc>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=(crc>>>8)^crcTable[(crc^byte)&0xff];return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
function paeth(left,above,upperLeft){const estimate=left+above-upperLeft,leftDistance=Math.abs(estimate-left),aboveDistance=Math.abs(estimate-above),upperLeftDistance=Math.abs(estimate-upperLeft);return leftDistance<=aboveDistance&&leftDistance<=upperLeftDistance?left:aboveDistance<=upperLeftDistance?above:upperLeft;}

export function canonicalPng(input){
 const source=Buffer.from(input);if(!source.subarray(0,8).equals(SIGNATURE))throw new Error('Expected PNG signature');
 let offset=8,header,compressed=[];
 while(offset+12<=source.length){const size=source.readUInt32BE(offset),type=source.toString('ascii',offset+4,offset+8),start=offset+8,end=start+size;if(end+4>source.length)throw new Error('Truncated PNG chunk');const data=source.subarray(start,end);if(type==='IHDR')header=Buffer.from(data);else if(type==='IDAT')compressed.push(data);else if(type==='IEND')break;else if(type[0]===type[0].toUpperCase())throw new Error(`Unsupported critical PNG chunk: ${type}`);offset=end+4;}
 if(!header||compressed.length===0)throw new Error('PNG is missing required chunks');
 const width=header.readUInt32BE(0),height=header.readUInt32BE(4),depth=header[8],color=header[9],interlace=header[12],channels=color===6?4:color===2?3:0;
 if(!width||!height||depth!==8||!channels||interlace!==0)throw new Error('Unsupported PNG format for canonical screenshot encoding');
 const bytesPerPixel=channels,rowBytes=width*channels,filtered=inflateSync(Buffer.concat(compressed));if(filtered.length!==height*(rowBytes+1))throw new Error('PNG image data has an unexpected size');
 const rows=Array.from({length:height},()=>Buffer.alloc(rowBytes));let cursor=0;
 for(let y=0;y<height;y++){const filter=filtered[cursor++],row=rows[y],above=y?rows[y-1]:undefined;for(let x=0;x<rowBytes;x++){const raw=filtered[cursor++],left=x>=bytesPerPixel?row[x-bytesPerPixel]:0,up=above?above[x]:0,upperLeft=above&&x>=bytesPerPixel?above[x-bytesPerPixel]:0;let predictor=0;if(filter===1)predictor=left;else if(filter===2)predictor=up;else if(filter===3)predictor=Math.floor((left+up)/2);else if(filter===4)predictor=paeth(left,up,upperLeft);else if(filter!==0)throw new Error(`Unsupported PNG row filter: ${filter}`);row[x]=(raw+predictor)&0xff;}}
 const raw=Buffer.alloc(height*(rowBytes+1));cursor=0;for(const row of rows){raw[cursor++]=0;row.copy(raw,cursor);cursor+=rowBytes;}
 const normalizedHeader=Buffer.from(header);normalizedHeader[10]=0;normalizedHeader[11]=0;normalizedHeader[12]=0;
 return Buffer.concat([SIGNATURE,chunk('IHDR',normalizedHeader),chunk('IDAT',deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
