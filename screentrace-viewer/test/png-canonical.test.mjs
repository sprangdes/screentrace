import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {canonicalPng} from '../tools/png-canonical.mjs';

function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(Buffer.concat([name,data])));return Buffer.concat([length,name,data,checksum]);}
function fixture(filters,level){const rows=[Buffer.from([10,20,30,255,40,50,60,255]),Buffer.from([70,80,90,255,100,110,120,255])],raw=[];for(let y=0;y<rows.length;y++){const row=rows[y],filter=filters[y],encoded=Buffer.alloc(row.length),previous=rows[y-1];for(let i=0;i<row.length;i++){const predictor=filter===1&&i>=4?row[i-4]:filter===2&&previous?previous[i]:0;encoded[i]=(row[i]-predictor+256)&255;}raw.push(Buffer.from([filter]),encoded);}const header=Buffer.alloc(13);header.writeUInt32BE(2,0);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.concat(raw),{level})),chunk('IEND',Buffer.alloc(0))]);}

test('guide screenshot PNG canonicalization ignores equivalent scanline filters and compression levels',()=>{
 const first=fixture([0,0],1),second=fixture([1,2],9),normalized=canonicalPng(first);
 assert.deepEqual(normalized,canonicalPng(second));
 assert.deepEqual(normalized,canonicalPng(normalized));
});
