export function validateProject(manifest,state){
  const issues=[];
  for(const field of manifest.fields||[]){
    if(field.id==='annexBlast')continue;
    const value=String(state.fields?.[field.id]??'');
    if(field.required&&!value.trim())issues.push({path:`fields.${field.id}`,message:`Preencha “${field.label}”.`});
    if(field.type==='date'&&value&&!validDate(value))issues.push({path:`fields.${field.id}`,message:`Confira a data em “${field.label}”.`});
  }
  const blast=manifest.tables?.find(table=>table.id==='blast');
  const blastRows=state.tables?.blast||blast?.rows||[];
  const blastCount=Math.max(1,(blastRows[1]?.length||3)-2);
  if(blast?.maxRepeatCount&&blastCount>blast.maxRepeatCount)issues.push({path:'tables.blast',message:`O modelo aceita até ${blast.maxRepeatCount} desmontes.`});
  for(let i=0;i<blastCount;i++)if(!String(blastRows[1]?.[i+2]??'').trim())issues.push({path:`tables.blast.1.${i+2}`,message:`Informe a identificação do desmonte ${i+1}.`});
  for(const table of manifest.tables||[]){
    const rows=state.tables?.[table.id]||table.rows||[];
    if(!rows.length)issues.push({path:`tables.${table.id}`,message:`A tabela “${table.label}” está vazia.`});
    for(let row=table.headerRows||0;row<rows.length;row++)for(const [column,type] of Object.entries(table.inputTypes||{}))if(type==='date'&&rows[row][Number(column)]&&!validDate(String(rows[row][Number(column)])))issues.push({path:`tables.${table.id}.${row}.${column}`,message:`Confira a data na tabela “${table.label}”.`});
  }
  const excluded=new Set(state.excludedImages||[]),images={...(state.images||{})};
  const required=(id,label,condition=true)=>{if(condition&&!images[id]?.dataUrl&&!excluded.has(id))issues.push({path:`images.${id}`,message:`Anexe “${label}” ou marque que esta imagem não se aplica.`});};
  const basePhotos=(manifest.images||[]).filter(slot=>slot.group!=='annexes'&&slot.group!=='conclusion');
  for(const slot of basePhotos)required(slot.id,slot.label,slot.group!=='blast'||(slot.blockIndex===101?blastCount>=1:blastCount>=2));
  for(const slot of (manifest.images||[]).filter(slot=>slot.group==='annexes'&&slot.id!=='image_339_0'&&slot.id!=='image_355_0'))required(slot.id,slot.label);
  const annexTypes=state.annexTypes||['full'];
  for(let i=0;i<blastCount;i++){
    const mode=annexTypes[i]||'full';
    if(!['full','plan'].includes(mode))issues.push({path:`annexTypes.${i}`,message:`Selecione o tipo de Anexo I do desmonte ${i+1}.`});
    if(i===0){required('image_339_0','temporização do primeiro desmonte',mode==='full');required('image_355_0','histograma do primeiro desmonte',mode==='full');}
    if(i>0){required(`annex_${i}_plan`,`plano de fogo do desmonte ${i+1}`);required(`annex_${i}_timing`,`temporização do desmonte ${i+1}`,mode==='full');required(`annex_${i}_histogram`,`histograma do desmonte ${i+1}`,mode==='full');}
    if(i>=2){
      required(`blast_photo_${i}`,`foto do desmonte ${i+1}`);
      if(!String(state.captions?.blast_photo_2??'').trim())issues.push({path:'captions.blast_photo_2',message:'Preencha a legenda da foto do desmonte 3.'});
    }
  }
  for(const slot of manifest.images||[]){const image=images[slot.id];if(image&&!/^data:image\/(png|jpeg);base64,/.test(image.dataUrl||''))issues.push({path:`images.${slot.id}`,message:`A imagem “${slot.label}” não é um PNG ou JPEG válido.`});}
  for(const image of Object.values(images))if(image&&!/^data:image\/(png|jpeg);base64,/.test(image.dataUrl||''))issues.push({path:'images',message:'Use somente fotos PNG ou JPEG.'});
  if(JSON.stringify(state).length>(manifest.limits?.max_project_bytes||200000000))issues.push({path:'project',message:'O projeto excede o limite total. Reduza o tamanho das imagens anexadas.'});
  return issues;
}
function validDate(value){
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)){const date=new Date(`${value}T00:00:00Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===value;}
  const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);if(!match)return false;
  const[,day,month,year]=match,date=new Date(`${year}-${month}-${day}T00:00:00Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===`${year}-${month}-${day}`;
}
