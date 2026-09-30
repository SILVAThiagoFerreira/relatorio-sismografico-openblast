const JSZip=globalThis.JSZip??(await import('jszip')).default;
const Xml=typeof DOMParser==='undefined'?await import('@xmldom/xmldom'):null;

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',R='http://schemas.openxmlformats.org/officeDocument/2006/relationships',A='http://schemas.openxmlformats.org/drawingml/2006/main',REL='http://schemas.openxmlformats.org/package/2006/relationships',CT='http://schemas.openxmlformats.org/package/2006/content-types';
const q=(ns,name)=>`{${ns}}${name}`;
function parser(){return typeof DOMParser!=='undefined'?new DOMParser():new Xml.DOMParser({errorHandler:{warning:()=>{},error:()=>{},fatalError:()=>{}}});}
function serializer(){return typeof XMLSerializer!=='undefined'?new XMLSerializer():new Xml.XMLSerializer();}
function parse(xml){const errors=[];const p=parser();const prior=p.onerror;p.onerror=(...args)=>errors.push(args.join(' '));const doc=p.parseFromString(xml,'application/xml');if(errors.length||!doc.documentElement||doc.documentElement.localName==='parsererror')throw new Error('O documento original contém XML inválido.');return doc;}
function els(node,ns,local){return Array.from(node.getElementsByTagNameNS(ns,local));}
function children(node,ns,local){return Array.from(node.childNodes).filter(child=>child.nodeType===1&&child.namespaceURI===ns&&child.localName===local);}
function attr(node,ns,local){return node.getAttributeNS(ns,local);}
function setAttr(node,ns,name,value){if(node)node.setAttributeNS(ns,`w:${name}`,String(value));}
function body(doc){return Array.from(doc.getElementsByTagNameNS(W,'body')[0].childNodes).filter(n=>n.nodeType===1);}
function readText(node){return els(node,W,'t').map(t=>t.textContent||'').join('');}
function replaceText(node,value){const texts=els(node,W,'t');if(!texts.length){const paragraph=node.localName==='p'?node:els(node,W,'p')[0];if(!paragraph)throw new Error('Um campo do modelo não contém parágrafo editável.');let run=children(paragraph,W,'r')[0];if(!run){run=docElement(paragraph.ownerDocument,W,'r');paragraph.appendChild(run);}let text=children(run,W,'t')[0];if(!text){text=docElement(paragraph.ownerDocument,W,'t');run.appendChild(text);}text.textContent=value;text.setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');return;}texts[0].textContent=value;texts[0].setAttributeNS('http://www.w3.org/XML/1998/namespace','xml:space','preserve');for(const text of texts.slice(1))text.textContent='';}
function docElement(doc,ns,name){return doc.createElementNS(ns,ns===W?`w:${name}`:name);}
function replaceExactWithRuns(node,expected,replacement){const texts=els(node,W,'t');const current=texts.map(t=>t.textContent||'').join('');if(current!==expected)throw new Error(`O campo “${replacement.id}” não corresponde ao modelo original. Confira o arquivo do modelo.`);replaceText(node,replacement.value);}
function makeInitialState(manifest){const tables=Object.fromEntries((manifest.tables||[]).map(t=>[t.id,structuredClone(t.rows||[])])),blastCount=Math.max(1,(tables.blast?.[1]?.length||3)-2);return {name:'Novo relatório',fields:Object.fromEntries((manifest.fields||[]).map(f=>[f.id,f.defaultValue??f.default??''])),tables,images:{},excludedImages:[],annexTypes:Array(blastCount).fill('full'),captions:{}};}
export function createInitialState(manifest){return makeInitialState(manifest);}
function base64ToBytes(value){const base64=value.slice(value.indexOf(',')+1);const raw=atob(base64);const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
function bytesToBase64(bytes){let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,Math.min(i+chunk,bytes.length)));return btoa(binary);}
function nextRelationshipId(relsDoc){const used=els(relsDoc,REL,'Relationship').map(el=>/^rId(\d+)$/.exec(el.getAttribute('Id'))).filter(Boolean).map(m=>Number(m[1]));return `rId${Math.max(0,...used)+1}`;}
function nextMediaName(zip){const files=Object.keys(zip.files);let i=1;while(files.includes(`word/media/openblast-added-${i}.png`)||files.includes(`word/media/openblast-added-${i}.jpg`))i++;return i;}
function resolveBlock(doc,block){return typeof block==='number'?body(doc)[block]:block;}
function setImage(doc,block,occurrence,slot,image,zip,rels,types){const paragraph=resolveBlock(doc,block);if(!paragraph||!['p','tbl'].includes(paragraph.localName))throw new Error(`A posição da foto “${slot.label}” não existe no modelo.`);const blips=els(paragraph,A,'blip'),blip=blips[occurrence];if(!blip)throw new Error(`A ocorrência da foto “${slot.label}” não existe no modelo.`);
  if(!image){if(!slot.required)return;throw new Error(`Anexe ou exclua explicitamente a imagem “${slot.label}”.`);}
  const mime=image.type||(/,([^;,]+);base64/.exec(image.dataUrl)?.[1]||'');const ext=mime.includes('png')?'png':mime.includes('jpeg')?'jpg':null;if(!ext)throw new Error(`A imagem “${slot.label}” deve ser PNG ou JPEG.`);const id=nextRelationshipId(rels);const index=nextMediaName(zip);const target=`media/openblast-added-${index}.${ext}`;zip.file(`word/${target}`,base64ToBytes(image.dataUrl));const rel=rels.createElementNS(REL,'Relationship');rel.setAttribute('Id',id);rel.setAttribute('Type','http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');rel.setAttribute('Target',target);rels.documentElement.appendChild(rel);blip.setAttributeNS(R,`r:embed`,id);const contentType=ext==='png'?'image/png':'image/jpeg';if(!els(types,CT,'Default').some(el=>el.getAttribute('Extension')===ext)){const entry=types.createElementNS(CT,'Default');entry.setAttribute('Extension',ext);entry.setAttribute('ContentType',contentType);types.documentElement.appendChild(entry);}
  let alternate=blip;while(alternate&&!(alternate.namespaceURI==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&alternate.localName==='AlternateContent'))alternate=alternate.parentNode;if(alternate){for(const fallback of children(alternate,'http://schemas.openxmlformats.org/markup-compatibility/2006','Fallback'))for(const node of [fallback,...Array.from(fallback.getElementsByTagName('*'))])if(node.hasAttributeNS(R,'id'))node.setAttributeNS(R,'r:id',id);}
}
function editCell(cell,value){const paragraphs=children(cell,W,'p');if(!paragraphs.length)throw new Error('Uma célula do modelo não contém parágrafo editável.');const lines=String(value??'').split(/\r?\n/),first=paragraphs[0];for(const paragraph of paragraphs.slice(1))cell.removeChild(paragraph);replaceText(first,lines[0]??'');for(const line of lines.slice(1)){const paragraph=first.cloneNode(true);replaceText(paragraph,line);cell.appendChild(paragraph);}}
function setCellWidth(cell,width){const cellWidth=els(cell,W,'tcW')[0];if(cellWidth){setAttr(cellWidth,W,'w',width);setAttr(cellWidth,W,'type','pct');}}
function addCellLike(doc,row,source,value,width){const clone=source.cloneNode(true);editCell(clone,value);setCellWidth(clone,width);row.appendChild(clone);return clone;}
function setGridWidth(gridCol,width){setAttr(gridCol,W,'w',width);}
function editBlastColumns(doc,table,definition,rows){const tbl=body(doc)[definition.blockIndex];if(!tbl||tbl.localName!=='tbl')throw new Error('Tabela de desmontes não encontrada no modelo.');const trs=children(tbl,W,'tr');const count=Math.max(1,rows?.[1]?.length-2||1);const gridElement=children(tbl,W,'tblGrid')[0];const initial=children(gridElement,W,'gridCol');if(initial.length!==3)throw new Error('A grade da tabela de desmontes não corresponde ao modelo.');
  while(children(gridElement,W,'gridCol').length<count+2){const current=children(gridElement,W,'gridCol');gridElement.appendChild(current.at(-1).cloneNode(true));}
  const grid=children(gridElement,W,'gridCol'),widths=grid.map(node=>Number(attr(node,W,'w'))||0),total=widths.reduce((a,b)=>a+b,0),labelWidth=widths[0],unitWidth=widths[1],perBlast=Math.floor((total-labelWidth-unitWidth)/count);setGridWidth(grid[0],labelWidth);setGridWidth(grid[1],unitWidth);for(let i=0;i<count;i++)setGridWidth(grid[2+i],perBlast);
  const hdr=children(trs[0],W,'tc')[0];setAttr(els(hdr,W,'gridSpan')[0],W,'val',grid.length);
  const unitPct=487,dataPct=Math.floor((5000-2294-unitPct)/count);
  for(let r=1;r<trs.length;r++){const cells=children(trs[r],W,'tc');const exemplar=cells[2];if(!exemplar)continue;setCellWidth(cells[0],2294);setCellWidth(cells[1],unitPct);setCellWidth(exemplar,dataPct);for(let c=1;c<count;c++)addCellLike(doc,trs[r],exemplar,rows[r]?.[c+2]??'',dataPct);editCell(exemplar,rows[r]?.[2]??'');}
}

function replaceSubstringPreservingRuns(node,needle,replacement){const texts=els(node,W,'t');const full=texts.map(el=>el.textContent||'').join('');const spans=[];let offset=0;for(const el of texts){const text=el.textContent||'';spans.push({el,start:offset,end:offset+text.length,original:text});offset+=text.length;}const matches=[];let cursor=0;while((cursor=full.indexOf(needle,cursor))!==-1){matches.push([cursor,cursor+needle.length]);cursor+=needle.length;}for(const [start,end] of matches.reverse()){const first=spans.find(span=>start>=span.start&&start<span.end),last=[...spans].reverse().find(span=>end>span.start&&end<=span.end);if(!first||!last)continue;const firstLocal=start-first.start,lastLocal=end-last.start;if(first===last)first.el.textContent=first.original.slice(0,firstLocal)+replacement+first.original.slice(lastLocal);else{first.el.textContent=first.original.slice(0,firstLocal)+replacement;for(const span of spans)if(span.start>first.start&&span.end<=last.start)span.el.textContent='';last.el.textContent=last.original.slice(lastLocal);}}
}

function renewCloneIds(roots,counter){for(const root of roots){const nodes=[root,...Array.from(root.getElementsByTagName('*'))];for(const node of nodes){for(const attribute of Array.from(node.attributes||[])){const local=attribute.localName,namespace=attribute.namespaceURI;if(local==='id'&&((namespace===W&&['bookmarkStart','bookmarkEnd','id'].includes(node.localName))||(node.localName==='docPr'&&namespace===''))){attribute.value=String(++counter.value);continue;}if(['paraId','textId','anchorId','editId'].includes(local)){attribute.value=(++counter.value).toString(16).padStart(8,'0').slice(-8).toUpperCase();continue;}if(node.localName==='docPr'&&local==='name')attribute.value=`OpenBlast clone ${++counter.value}`;}}}}
function cloneRange(doc,sourceBlocks,range,anchorBlock,counter){const anchor=sourceBlocks[anchorBlock];if(!anchor?.parentNode)throw new Error('Não foi possível localizar o ponto de inserção da seção repetida.');const nodes=sourceBlocks.slice(range[0],range[1]+1).map(node=>node.cloneNode(true));renewCloneIds(nodes,counter);for(const node of nodes)anchor.parentNode.insertBefore(node,anchor);return nodes;}
function nextDrawingId(doc){let max=0;for(const node of els(doc,'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','docPr'))max=Math.max(max,Number(node.getAttribute('id'))||0);return {value:max};}
function blastIdentifiers(state){const rows=state.tables?.blast||[],row=rows[1]||[];return Array.from({length:Math.max(1,row.length-2)},(_,index)=>String(row[index+2]??'').trim());}
function addRepeatableSections(doc,sourceBlocks,manifest,state,zip,rels,types){const spec=manifest.repeatableSections||{},ids=blastIdentifiers(state),annexTypes=state.annexTypes||['full'],counter=nextDrawingId(doc),result={photo:null,annexes:[]};
  if(ids.length>(spec.maxBlasts||3))throw new Error(`O modelo aceita até ${spec.maxBlasts||3} desmontes.`);
  for(const [index,id] of ids.entries())if(!id)throw new Error(`Informe a identificação do desmonte ${index+1}.`);
  const photo=spec.blastPhoto;if(ids.length>=3&&photo){cloneRange(doc,sourceBlocks,[photo.pageBreakBlock,photo.pageBreakBlock],photo.insertBeforeBlock,counter);result.photo=cloneRange(doc,sourceBlocks,photo.templateRange,photo.insertBeforeBlock,counter);}
  const annex=spec.blastAnnex;for(let i=1;i<ids.length;i++){const mode=annexTypes[i]||'full';if(!['full','plan'].includes(mode))throw new Error(`Tipo de Anexo I inválido no desmonte ${i+1}.`);let nodes;if(mode==='full')nodes=cloneRange(doc,sourceBlocks,annex.fullRange,annex.insertBeforeBlock,counter);else{nodes=cloneRange(doc,sourceBlocks,annex.planRange,annex.insertBeforeBlock,counter);nodes.push(...cloneRange(doc,sourceBlocks,[annex.pageBreakBlock,annex.pageBreakBlock],annex.insertBeforeBlock,counter));}result.annexes.push({index:i,id:ids[i],mode,nodes});}
  const firstMode=annexTypes[0]||'full';if(!['full','plan'].includes(firstMode))throw new Error('Tipo de Anexo I inválido no primeiro desmonte.');if(firstMode==='plan')for(let i=annex.planRange[1]+1;i<annex.pageBreakBlock;i++)sourceBlocks[i].parentNode?.removeChild(sourceBlocks[i]);
  if(result.photo){const imageSlot={id:'blast_photo_2',label:`Local do desmonte 3`,required:true};setImage(doc,result.photo[0],0,imageSlot,state.images?.[imageSlot.id],zip,rels,types);const caption=String(state.captions?.[imageSlot.id]??'').trim();if(!caption)throw new Error('Preencha a legenda da foto do desmonte 3.');replaceText(result.photo[photo.captionOffset],caption);}
  const annexField=(manifest.fields||[]).find(field=>field.id==='annexBlast'),replacement=annexField?.replacement;const baseId=ids[0];if(annexField&&readText(sourceBlocks[annex.fullRange[0]])!==annexField.original)throw new Error('A identificação do Anexo I não corresponde ao modelo publicado.');if(replacement)replaceSubstringPreservingRuns(sourceBlocks[annex.fullRange[0]],replacement,baseId);
  for(const clone of result.annexes){const cover=clone.nodes[0];if(replacement)replaceSubstringPreservingRuns(cover,replacement,clone.id);for(const [suffix,offset,slotId] of [['plan',annex.planImageOffset,'image_327_0'],['timing',annex.timingImageOffset,'image_339_0'],['histogram',annex.histogramImageOffset,'image_355_0']]){if(suffix!=='plan'&&clone.mode!=='full')continue;const sourceSlot=(manifest.images||[]).find(slot=>slot.id===slotId);const dynamic={...sourceSlot,id:`annex_${clone.index}_${suffix}`,label:`Anexo I do desmonte ${clone.index+1} — ${suffix==='plan'?'plano de fogo':suffix==='timing'?'temporização':'histograma'}`,required:true};const image=state.images?.[dynamic.id];setImage(doc,clone.nodes[offset],0,dynamic,image,zip,rels,types);}}
  return {ids,firstMode};}

function removeImage(doc,block,occurrence,slot){const targetBlock=resolveBlock(doc,block);const blips=els(targetBlock,A,'blip');const blip=blips[occurrence];if(!blip)return;let alternate=blip;while(alternate&&!(alternate.namespaceURI==='http://schemas.openxmlformats.org/markup-compatibility/2006'&&alternate.localName==='AlternateContent'))alternate=alternate.parentNode;let remove=alternate;if(!remove){remove=blip;while(remove&&remove.localName!=='drawing'&&remove.localName!=='pict')remove=remove.parentNode;}if(remove?.parentNode)remove.parentNode.removeChild(remove);}
function editTable(doc,definition,state,nodes=body(doc)){const tbl=nodes[definition.blockIndex];if(!tbl||tbl.localName!=='tbl')throw new Error(`Tabela “${definition.id}” não existe no modelo.`);const rows=state.tables?.[definition.id]||definition.rows||[];if(definition.mode==='blastColumns'||definition.repeatColumns){editBlastColumns(doc,tbl,definition,rows);return;}const trs=children(tbl,W,'tr');const dataStart=definition.dataStartRow??definition.headerRows??0;while(trs.length>rows.length){tbl.removeChild(trs[trs.length-1]);trs.pop();}while(trs.length<rows.length){const source=trs.at(-1),clone=source.cloneNode(true);tbl.appendChild(clone);trs.push(clone);}for(let r=0;r<rows.length;r++){const cells=children(trs[r],W,'tc');for(let c=0;c<Math.min(cells.length,rows[r]?.length||0);c++){if(r<(definition.headerRows||0))continue;if(r>=dataStart&&Array.isArray(definition.editableColumns)&&!definition.editableColumns.includes(c)&&!definition.editableCells?.some(x=>x.row===r&&x.col===c)&&!definition.clearColumns?.includes(c))continue;let value=String(rows[r][c]??'');if(definition.inputTypes?.[c]==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [year,month,day]=value.split('-');value=`${day}/${month}/${year}`;}editCell(cells[c],value);}}}

export async function generateReport(manifest,state){
  if(!manifest?.template?.url||!manifest.template.sha256)throw new Error('Manifesto do modelo incompleto.');
  const response=await fetch(manifest.template.url);
  if(!response.ok)throw new Error('Não foi possível carregar o modelo original. Recarregue a página e tente novamente.');
  const source=await response.arrayBuffer();
  if(!globalThis.crypto?.subtle)throw new Error('Este navegador não oferece verificação segura do modelo.');
  const digest=await crypto.subtle.digest('SHA-256',source);
  const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  if(hash!==manifest.template.sha256)throw new Error('O modelo publicado foi alterado ou está incompleto. Atualize a página e tente novamente.');
  const zip=await JSZip.loadAsync(source);
  const [xml,relsXml,typesXml]=await Promise.all([zip.file('word/document.xml')?.async('string'),zip.file('word/_rels/document.xml.rels')?.async('string'),zip.file('[Content_Types].xml')?.async('string')]);
  if(!xml||!relsXml||!typesXml)throw new Error('O modelo original está incompleto e não pode ser gerado.');
  const doc=parse(xml),rels=parse(relsXml),types=parse(typesXml),nodes=body(doc);
  const repeated=addRepeatableSections(doc,nodes,manifest,state,zip,rels,types);
  for(const field of manifest.fields||[]){
    if(field.id==='annexBlast')continue;
    const node=nodes[field.blockIndex];
    if(!node)throw new Error(`Campo “${field.label}” não existe no modelo.`);
    let value=String(state.fields?.[field.id]??'');
    if(field.type==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(value)){const [year,month,day]=value.split('-');value=`${day}/${month}/${year}`;}
    if(field.original!==undefined&&readText(node)!==field.original)throw new Error(`Campo “${field.label}” não corresponde ao original; geração interrompida.`);
    replaceExactWithRuns(node,readText(node),{id:field.id,value:field.prefix?field.prefix+value:value});
  }
  for(const table of manifest.tables||[])editTable(doc,table,state,nodes);
  const slots=[...(manifest.images||[])].sort((a,b)=>a.blockIndex-b.blockIndex||b.occurrence-a.occurrence),firstMode=repeated.firstMode;
  for(const slot of slots){
    const image=state.images?.[slot.id];
    const inactive=firstMode==='plan'&&['image_339_0','image_355_0'].includes(slot.id);
    if(inactive||state.excludedImages?.includes(slot.id)||(!image&&!slot.required)){removeImage(doc,nodes[slot.blockIndex],slot.occurrence,slot);continue;}
    setImage(doc,nodes[slot.blockIndex],slot.occurrence,slot,image,zip,rels,types);
  }
  zip.file('word/document.xml',serializer().serializeToString(doc));
  zip.file('word/_rels/document.xml.rels',serializer().serializeToString(rels));
  zip.file('[Content_Types].xml',serializer().serializeToString(types));
  const blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE',compressionOptions:{level:6}});
  const stem=String(state.name||'Relatorio_Sismografico').trim().replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').replace(/^_+|_+$/g,'')||'Relatorio_Sismografico';
  return {blob,filename:`${stem}.docx`,audit:{templateSha256:manifest.template.sha256,fields:(manifest.fields||[]).length,tables:(manifest.tables||[]).length,images:Object.keys(state.images||{}).length,blasts:repeated.ids.length}};
}
