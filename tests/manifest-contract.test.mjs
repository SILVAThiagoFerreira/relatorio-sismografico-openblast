import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {DOMParser} from '@xmldom/xmldom';
import JSZip from 'jszip';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(resolve(root,'pages/assets/template-manifest.json'),'utf8'));
const bytes=await readFile(resolve(root,'pages',manifest.template.url));
const zip=await JSZip.loadAsync(bytes);
const parser=new DOMParser();
const xml=parser.parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');
const NS='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const body=xml.getElementsByTagNameNS(NS,'body')[0];
const blocks=Array.from(body.childNodes).filter(n=>n.nodeType===1);

test('manifest identifies exact model digest and unique editable locations',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.template.sha256);
  for(const category of ['fields','tables','images']){
    const ids=manifest[category].map(f=>f.id);
    assert.equal(new Set(ids).size,ids.length,`Duplicate ${category} identifiers`);
    for(const field of manifest[category]) assert.ok(blocks[field.blockIndex],`Missing block ${field.id}`);
  }
});

test('editable tables retain row geometry and fixed cell text',()=>{
  for(const table of manifest.tables){
    const block=blocks[table.blockIndex];
    assert.equal(block.localName,'tbl',table.id);
    const rows=Array.from(block.childNodes).filter(n=>n.nodeType===1 && n.localName==='tr');
    assert.equal(rows.length,table.rows.length,table.id);
    rows.forEach((row,i)=>{
      const cells=Array.from(row.childNodes).filter(n=>n.nodeType===1 && n.localName==='tc');
      assert.equal(cells.length,table.rows[i].length,`${table.id} row ${i}`);
      cells.forEach((cell,j)=>{
        const editable=table.editableCells.some(location=>location.row===i && location.col===j);
        if(!editable) assert.equal(Array.from(cell.getElementsByTagNameNS(NS,'t')).map(n=>n.textContent).join(''),table.rows[i][j],`${table.id}[${i},${j}]`);
      });
    });
  }
});

test('editable image slots exclude original normative graphs',()=>{
  const slots=manifest.images.map(i=>i.blockIndex);
  assert.ok(!slots.includes(57),'Normative graph Figure 1 must stay fixed');
  assert.ok(!slots.includes(61),'Normative graph Figure 2 must stay fixed');
  for(const slot of manifest.images){
    assert.ok(slot.widthEmu>0 && slot.heightEmu>0,slot.id);
    assert.ok(slot.originalRelationship,slot.id);
    if(slot.captionFieldId) assert.ok(manifest.fields.some(f=>f.id===slot.captionFieldId),slot.id);
  }
});
