import {parseDomAssTrack} from "../renderers/dom/track.js";
import {normalizeAssKey, splitAssFields, assFieldsToObject} from "./ass-parser.js";
// Validate structure without copying authored text into rejection messages.
function validateSubtitleContent(content) {
 let section = "", eventFormat = null, styleFormat = null, dialogueCount = 0;
 const fail = (line, reason) => {throw new Error(`Line ${line}: ${reason}.`);};
 const numericStyles = new Set(["fontsize", "bold", "italic", "underline", "strikeout", "scalex", "scaley", "spacing", "angle", "borderstyle", "outline", "shadow", "alignment", "marginl", "marginr", "marginv", "encoding"]);
 const lines = String(content).split(/\r\n|\r|\n/);
 for (let i=0; i<lines.length; i++) {
  const line=lines[i].trim(), n=i+1;
  if (!line || line.startsWith(";")) continue;
  const heading=line.match(/^\[([^\]]+)\]$/);
  if(heading) {section=heading[1].toLowerCase(); if(!["script info", "v4+ styles", "v4 styles", "events"].includes(section)) fail(n,"unsupported section"); continue;}
  const format=line.match(/^Format\s*:\s*(.*)$/i);
  if(format) {
   const fields=splitAssFields(format[1]).map(normalizeAssKey);
   if(new Set(fields).size !== fields.length || fields.some(f=>!f)) fail(n,"invalid field format");
   if(section==="events") { if(fields.some(f=>!["layer","marked","start","end","style","name","marginl","marginr","marginv","effect","text"].includes(f))) fail(n,"unsupported event field"); if(!["start","end","style","text"].every(f=>fields.includes(f)) || fields.at(-1)!=="text") fail(n,"invalid event format"); eventFormat=fields; }
   else if(section==="v4+ styles" || section==="v4 styles") {if(!["name","fontname","fontsize"].every(f=>fields.includes(f))) fail(n,"invalid style format"); styleFormat=fields;}
   else fail(n,"misplaced format");
   continue;
  }
  if(/^Style\s*:/i.test(line)) {
   if(!styleFormat || !["v4+ styles","v4 styles"].includes(section)) fail(n,"style without format");
   const value=line.replace(/^Style\s*:\s*/i,""), fields=value.split(",");
   if(fields.length!==styleFormat.length) fail(n,"invalid style field count");
   const data=assFieldsToObject(styleFormat, fields.map(f=>f.trim()));
   for(const [key,value] of Object.entries(data)) {
    if(numericStyles.has(key) && (!value || !Number.isFinite(Number(value)))) fail(n,"invalid numeric style field");
    if(key.endsWith("colour") && !/^&H(?:[0-9a-f]{6}|[0-9a-f]{8})&?$/i.test(value)) fail(n,"invalid style color");
   }
   if ((data.borderstyle && Number(data.borderstyle)!==1) || ["angle","spacing"].some(k=>data[k] && Number(data[k])!==0) || ["scalex","scaley"].some(k=>data[k] && Number(data[k])!==100)) fail(n,"unsupported style transform, spacing, or border");
   if(Number(data.fontsize)<=0 || ["outline","shadow"].some(k=>data[k] && Number(data[k])<0) || (data.alignment && (!Number.isInteger(Number(data.alignment)) || Number(data.alignment)<1 || Number(data.alignment)>9))) fail(n,"invalid style dimensions or alignment");
   continue;
  }
  if(/^Dialogue\s*:/i.test(line)) {
   if(section!=="events" || !eventFormat) fail(n,"dialogue without event format");
   const value=line.replace(/^Dialogue\s*:\s*/i,"");
   if(value.split(",").length<eventFormat.length) fail(n,"invalid event field count");
   const data=assFieldsToObject(eventFormat,splitAssFields(value,eventFormat.length));
   if(data.effect) fail(n,"unsupported event effect");
   for(const key of ["layer","marked","marginl","marginr","marginv"]) if(data[key] && !/^(?:Marked=)?[+-]?\d+$/.test(data[key])) fail(n,"invalid numeric event field");
   dialogueCount++;
   continue;
  }
  if(section==="events" && /^Comment\s*:/i.test(line)) continue;
  if(section==="script info" && /^[^:]+:/.test(line)) {
   if(/^PlayRes[XY]\s*:/i.test(line) && !/^PlayRes[XY]\s*:\s*[1-9]\d*$/i.test(line)) fail(n,"invalid script resolution");
   continue;
  }
  fail(n,"malformed or unsupported record");
 }
 const track=parseDomAssTrack(content);
 if(!track.supported) {
  const match=track.reason.match(/^line (\d+): (.*)$/);
  fail(match ? Number(match[1]) : Math.max(1,lines.length), match ? match[2] : "no supported comments");
 }
 // Empty timed records are harmless; every nonempty dialogue must parse.
 if(!dialogueCount) fail(1,"no dialogue records");
 return track;
}
export {validateSubtitleContent};
