import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {createHash} from 'node:crypto';

const root=resolve(import.meta.dirname,'..');
const modelName='- R.334.r01_NBR9653_2018-REV2.docx';

test('public DOCX matches its manifest and contains sanitized fields',async()=>{
  const manifest=JSON.parse(await readFile(resolve(root,'pages/assets/template-manifest.json'),'utf8'));
  const templatePath=manifest.template?.url??manifest.template?.path??manifest.templateUrl;
  assert.equal(typeof templatePath,'string','Manifest must identify the public model');
  const published=await readFile(resolve(root,'pages',templatePath.replace(/^\.\//,'')));
  assert.equal(createHash('sha256').update(published).digest('hex'),manifest.template.sha256);
  const sourcePath=resolve(root,'EXEMPLOS',modelName);
  const source=await readFile(sourcePath).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(source)assert.notDeepEqual(published,source,'The public copy must be sanitized without replacing the local source.');
  const zip=await JSZip.loadAsync(published);
  for(const part of ['word/document.xml','word/styles.xml','word/numbering.xml','word/_rels/document.xml.rels','[Content_Types].xml'])assert.ok(zip.file(part),`Missing OOXML part ${part}`);
  const document=await zip.file('word/document.xml').async('string');
  for(const stale of ['Luan Carlos Silva Pereira','1421141833','21/11/2025','PP 120A1025','Foram verificados os valores de vibração'])assert.ok(!document.includes(stale),`Stale private/example value remains: ${stale}`);
  assert.equal((manifest.tables.find(table=>table.id==='engineer').rows[1]||[]).slice(0,3).join(''),'','The public form must start without the former technician details.');
  const signature=await zip.file('word/media/image5.png').async('uint8array');
  assert.deepEqual(Array.from(signature),Array.from(Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082','hex')),'The previous signature pixels must be replaced with a transparent placeholder.');
});

test('public site contains no filled operational report documents',async()=>{
  async function all(directory){const entries=await readdir(directory,{withFileTypes:true});return (await Promise.all(entries.map(entry=>entry.isDirectory()?all(resolve(directory,entry.name)):[resolve(directory,entry.name)]))).flat();}
  const documents=(await all(resolve(root,'pages'))).filter(path=>path.endsWith('.docx'));
  assert.equal(documents.length,1,'Only the blank sanitized model belongs to the public site');
});
