import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {guidePayload} from '../tools/guide-screenshots.mjs';
import {fileFixture} from './fixture.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const shots=['canvas.png','search-url.png','zoom-focus.png','screen-buttons.png','progress-file.png','progress-panel.png','simulate-choices.png','simulate-dialog.png','api-page.png','help-popover.png'];
const privateMarkers=[os.homedir(),root,'/Users/','C:\\Users\\','file://'].filter(Boolean);

test('synthetic guide report HTML and screenshot bytes contain no local absolute paths',async()=>{
 const url=await fileFixture(guidePayload()),html=await readFile(fileURLToPath(url),'utf8');
 for(const marker of privateMarkers)assert.ok(!html.includes(marker),`report HTML contains ${marker}`);
 for(const name of shots){const bytes=await readFile(path.join(root,'docs/images/user-guide',name));assert.ok(bytes.length>1000,`${name} must be non-empty`);for(const marker of privateMarkers)assert.ok(!bytes.includes(Buffer.from(marker)),`${name} contains ${marker}`);}
});
