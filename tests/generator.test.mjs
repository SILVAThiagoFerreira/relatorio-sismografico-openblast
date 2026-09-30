import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import JSZip from 'jszip';
import {DOMParser,XMLSerializer} from '@xmldom/xmldom';
globalThis.JSZip=JSZip;
globalThis.DOMParser=DOMParser;
globalThis.XMLSerializer=XMLSerializer;
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(resolve(root,'pages/assets/template-manifest.json'),'utf8'));
const source=await readFile(resolve(root,'pages',manifest.template.url));
globalThis.fetch=async url=>{
  assert.equal(url,manifest.template.url);
  return new Response(source,{status:200});
};
const {generateReport,createInitialState}=await import('../pages/generator.js');
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
function blocks(doc){return Array.from(doc.getElementsByTagNameNS(W,'body')[0].childNodes).filter(n=>n.nodeType===1);}
function parse(text){return new DOMParser().parseFromString(text,'application/xml');}
function frameStructure(node){const clone=node.cloneNode(true);for(const item of [clone,...Array.from(clone.getElementsByTagName('*'))])for(const attribute of Array.from(item.attributes||[]))if(['id','name','paraId','textId','anchorId','editId'].includes(attribute.localName))item.removeAttributeNode(attribute);return new XMLSerializer().serializeToString(clone);}
const sourceDoc=parse(await (await JSZip.loadAsync(source)).file('word/document.xml').async('string'));
const timingFrameStructure=frameStructure(blocks(sourceDoc)[manifest.repeatableSections.blastAnnex.planRange[1]+1]);
function countTimingFrames(doc){return blocks(doc).filter(block=>frameStructure(block)===timingFrameStructure).length;}
function filled(){
  const state=createInitialState(manifest);
  state.name='QA Sintetico';
  for(const field of manifest.fields) state.fields[field.id]=field.id==='period'?'30/09/2026':field.id==='annexBlast'?'QA300926':field.defaultValue||`QA ${field.label}`;
  state.excludedImages=manifest.images.filter(i=>i.required).map(i=>i.id);
  const blast=manifest.tables.find(t=>t.id==='blast');
  if(blast) state.tables.blast[1][2]='QA300926';
  return state;
}

test('generation preserves all original fixed package parts',async()=>{
  const original=await JSZip.loadAsync(source);
  const result=await generateReport(manifest,filled());
  assert.equal(result.filename,'QA_Sintetico.docx');
  const produced=await JSZip.loadAsync(await result.blob.arrayBuffer());
  const editable=new Set(['word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml']);
  for(const [name,file] of Object.entries(original.files)){
    if(file.dir||editable.has(name))continue;
    assert.deepEqual(await produced.file(name).async('uint8array'),await file.async('uint8array'),`Fixed part changed: ${name}`);
  }
  const generatedDoc=parse(await produced.file('word/document.xml').async('string'));
  const originalDoc=parse(await original.file('word/document.xml').async('string'));
  for(const index of new Set(manifest.images.filter(slot=>slot.required).map(slot=>slot.blockIndex))){
    assert.equal(blocks(generatedDoc)[index].getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip').length,0,`Excluded images remain in block ${index}`);
  }
  for(const definition of manifest.tables){
    const rows=Array.from(blocks(generatedDoc)[definition.blockIndex].childNodes).filter(n=>n.nodeType===1&&n.localName==='tr');
    assert.equal(rows.length,definition.rows.length,`Image exclusion deleted table rows ${definition.id}`);
  }
  for(const index of [57,61])assert.equal(new XMLSerializer().serializeToString(blocks(generatedDoc)[index]),new XMLSerializer().serializeToString(blocks(originalDoc)[index]),`Normative figure block ${index}`);
  await mkdir(resolve(root,'analysis/generated'),{recursive:true});
  await writeFile(resolve(root,'analysis/generated/qa-synthetic.docx'),Buffer.from(await result.blob.arrayBuffer()));
});

test('multi-blast table has consistent grid and header span',async()=>{
  const state=filled();
  state.tables.blast[1][2]='QA1';
  for(let i=1;i<state.tables.blast.length;i++)state.tables.blast[i].push(i===1?'QA2':'',i===1?'QA3':'');
  state.annexTypes=['full','full','plan'];
  state.captions.blast_photo_2='Figura 3.3 – Local do desmonte – QA3.';
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aazsAAAAASUVORK5CYII=';
  const sample={type:'image/png',dataUrl:`data:image/png;base64,${png}`};
  state.images.blast_photo_2=sample;
  for(const id of ['image_327_0','image_339_0','image_355_0','annex_1_plan','annex_1_timing','annex_1_histogram','annex_2_plan'])state.images[id]=sample;
  state.excludedImages=state.excludedImages.filter(id=>!['image_327_0','image_339_0','image_355_0'].includes(id));
  state.tables.locations[2][0]='QA1\nQA2\nQA3';
  const result=await generateReport(manifest,state);
  const produced=await JSZip.loadAsync(await result.blob.arrayBuffer());
  const doc=parse(await produced.file('word/document.xml').async('string'));
  const definition=manifest.tables.find(t=>t.id==='blast');
  const table=blocks(doc)[definition.blockIndex];
  const grid=table.getElementsByTagNameNS(W,'gridCol');
  assert.equal(grid.length,5,'Three blast columns plus parameter/unit');
  const span=table.getElementsByTagNameNS(W,'gridSpan')[0];
  assert.equal(span.getAttributeNS(W,'val'),'5','Merged header must span entire grid');
  const text=doc.documentElement.textContent;
  assert.ok(text.includes('Figura 3.3 – Local do desmonte – QA3.'));
  assert.ok(text.includes('QA1QA2QA3'),'Coordinate cell should retain three paragraphs');
  assert.equal((text.match(/PP \[IDENTIFICAÇÃO\]/g)||[]).length,0,'Every annex heading must use the blast identifier');
  assert.ok(text.includes('QA2')&&text.includes('QA3'),'Each annex should carry the corresponding blast identifier');
  assert.equal((text.match(/Tier-Up Plan/g)||[]).length,2,'The full second annex must duplicate its timing pages and the third plan-only annex must omit them');
  assert.equal(countTimingFrames(doc),2,'Only the original full annex and repeated full annex may contain the empty frame preceding timing; clone names are intentionally renewed');
  await mkdir(resolve(root,'analysis/generated'),{recursive:true});
  await writeFile(resolve(root,'analysis/generated/qa-three-blasts.docx'),Buffer.from(await result.blob.arrayBuffer()));
});

test('missing required photo causes explicit generation failure',async()=>{
  const state=filled();
  state.excludedImages=[];
  await assert.rejects(generateReport(manifest,state),/Anexe|imagem|foto/i);
});

test('photo replacement isolates new relationship and preserves original media',async()=>{
  const state=filled();
  const slot=manifest.images.find(image=>image.required);
  state.excludedImages=state.excludedImages.filter(id=>id!==slot.id);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aazsAAAAASUVORK5CYII=';
  state.images[slot.id]={type:'image/png',dataUrl:`data:image/png;base64,${png}`,name:'pixel.png'};
  const result=await generateReport(manifest,state);
  const original=await JSZip.loadAsync(source);
  const produced=await JSZip.loadAsync(await result.blob.arrayBuffer());
  for(const name of Object.keys(original.files).filter(name=>name.startsWith('word/media/')&&!original.files[name].dir)){
    assert.deepEqual(await produced.file(name).async('uint8array'),await original.file(name).async('uint8array'),`Original shared media changed: ${name}`);
  }
  const additions=Object.keys(produced.files).filter(name=>name.startsWith('word/media/')&&!original.files[name]&&!produced.files[name].dir);
  assert.equal(additions.length,1);
  assert.deepEqual(await produced.file(additions[0]).async('uint8array'),new Uint8Array(Buffer.from(png,'base64')));
  const doc=parse(await produced.file('word/document.xml').async('string'));
  const blip=blocks(doc)[slot.blockIndex].getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip')[slot.occurrence];
  assert.notEqual(blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed'),slot.originalRelationship);
  let alternate=blip;
  while(alternate&&alternate.localName!=='AlternateContent')alternate=alternate.parentNode;
  assert.equal(alternate.localName,'AlternateContent','The image keeps its compatibility wrapper for alternate DOCX renderers');
  const fallback=Array.from(alternate.childNodes).find(node=>node.nodeType===1&&node.localName==='Fallback');
  assert.ok(fallback,'The image keeps its VML fallback');
  const legacyImages=Array.from(fallback.getElementsByTagName('*')).filter(node=>node.hasAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
  assert.ok(legacyImages.length,'The VML fallback still has an image reference');
  for(const imageNode of legacyImages)assert.equal(imageNode.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','embed'),'Both DOCX render paths point to the new image');
});

test('filled report retains every image slot and requested cell values',async()=>{
  const state=filled();
  state.excludedImages=[];
  const sampleBytes=await readFile(resolve(root,'EXEMPLOS/09. Setembro/25.09.2026 - PP590926; PC590926; REG/25.09.2026 - R.334.r01_NBR9653_2018-REV2.docx')).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  let photo='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aazsAAAAASUVORK5CYII=',mime='image/png';
  if(sampleBytes){
    const sampleZip=await JSZip.loadAsync(sampleBytes);
    const photoPart=Object.values(sampleZip.files).find(file=>!file.dir&&/^word\/media\/.*\.(jpeg|jpg)$/.test(file.name));
    assert.ok(photoPart,'Supplied operational reference photo exists');
    photo=await photoPart.async('base64');mime='image/jpeg';
  }
  for(const slot of manifest.images)state.images[slot.id]={type:mime,dataUrl:`data:${mime};base64,${photo}`,name:'reference-qa'};
  state.tables.engineer[1][0]='Engenheiro QA';
  state.tables.engineer[1][1]='Responsável técnico';
  state.tables.engineer[1][2]='123456789';
  const result=await generateReport(manifest,state);
  const produced=await JSZip.loadAsync(await result.blob.arrayBuffer());
  const doc=parse(await produced.file('word/document.xml').async('string'));
  for(const slot of manifest.images){
    assert.ok(blocks(doc)[slot.blockIndex].getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip')[slot.occurrence],slot.id);
  }
  const engineer=blocks(doc)[manifest.tables.find(table=>table.id==='engineer').blockIndex];
  assert.ok(engineer.textContent.includes('Engenheiro QA'));
  assert.ok(engineer.textContent.includes('123456789'));
  await mkdir(resolve(root,'analysis/generated'),{recursive:true});
  await writeFile(resolve(root,'analysis/generated/qa-all-photos.docx'),Buffer.from(await result.blob.arrayBuffer()));
});


test('plan-only original and repeated annexes omit the frame preceding timing',async()=>{
  const state=filled();state.annexTypes=['plan','plan'];
  for(let i=1;i<state.tables.blast.length;i++)state.tables.blast[i].push(i===1?'QA2':'');
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aazsAAAAASUVORK5CYII=';
  const sample={type:'image/png',dataUrl:`data:image/png;base64,${png}`};
  state.images.image_327_0=sample;state.images.annex_1_plan=sample;
  state.excludedImages=state.excludedImages.filter(id=>id!=='image_327_0');
  const result=await generateReport(manifest,state);
  const produced=await JSZip.loadAsync(await result.blob.arrayBuffer());
  const doc=parse(await produced.file('word/document.xml').async('string'));
  assert.equal(countTimingFrames(doc),0,'Neither plan-only annex may retain the empty timing frame, regardless of cloned drawing IDs or names');
  assert.equal((doc.documentElement.textContent.match(/Tier-Up Plan/g)||[]).length,0,'Plan-only annexes omit timing headings');
  assert.equal((doc.documentElement.textContent.match(/Plano de Fogo/g)||[]).length,2,'Both annexes retain their plan heading');
});
