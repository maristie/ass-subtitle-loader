import test from 'node:test';
import assert from 'node:assert/strict';
import {readSubtitleFile} from '../../src/content/file-reader.js';
const file=bytes=>({arrayBuffer:async()=>Uint8Array.from(bytes).buffer});
for(const [label,bytes,text] of [
 ['utf-8',[0xef,0xbb,0xbf,0x63,0x61,0x66,0xc3,0xa9],'café'],
 ['utf-16le',[0xff,0xfe,0x41,0,0x42,0],'AB'],
 ['utf-16be',[0xfe,0xff,0,0x41,0,0x42],'AB'],
 ['shift_jis',[0x93,0xfa,0x96,0x7b],'日本'],
 ['gb18030',[0xd6,0xd0,0xce,0xc4],'中文'],
 ['big5',[0xa4,0xa4,0xa4,0xe5],'中文'],
 ['windows-1252',[0x63,0x61,0x66,0xe9],'café']
]) test(`file reader preserves ${label} text`,async()=>assert.equal(await readSubtitleFile(file(bytes),label),text));
test('auto detection honors UTF-16 BOM and legacy single-byte fallback',async()=>{assert.equal(await readSubtitleFile(file([0xfe,0xff,0,0x41]),'auto'),'A');assert.equal(await readSubtitleFile(file([0xe9]),'auto'),'é');});
