import hashlib
import xml.etree.ElementTree as ET
from .reader import NS
def text(element):return ''.join(n.text or '' for n in element.findall('.//w:t',NS))
def build_manifest(config,raw,document,body):
    manifest={'version':config['schema_version'],'template':{'url':'assets/'+config['template_name'],'sha256':hashlib.sha256(raw).hexdigest(),'size':len(raw)},'visual':config['visual'],'limits':config['limits'],'repeatableSections':config.get('repeatableSections',{}),'fields':[],'tables':[],'images':[]}
    for f in config['fields']:
        manifest['fields'].append({**f,'defaultValue':f['default'],'type':'textarea' if f['id'].startswith('conclusion') else 'text','section':f['group'],'original':text(body[f['blockIndex']]),'textNodes':[n.text or '' for n in body[f['blockIndex']].findall('.//w:t',NS)]})
    for t in config['tables']:
        rows=[[text(c) for c in r.findall('w:tc',NS)] for r in body[t['blockIndex']].findall('w:tr',NS)]
        for row in rows[t['headerRows']:]:
            for col in t.get('clearColumns',[]):row[col]=''
        editable=[{'row':i,'col':j} for i,row in enumerate(rows) if i>=t['headerRows'] for j in range(len(row)) if j in t.get('editableColumns',range(len(row)))]
        manifest['tables'].append({**t,'rows':rows,'section':t['group'],'dataStartRow':t['headerRows'],'editableCells':editable,'mode':'blastColumns' if t.get('repeatColumns') else 'rows' if t.get('repeatRows') else 'fixed'})
    for group in config['image_groups']:
        for i,index in enumerate(group['blocks']):
            for occurrence,blip in enumerate(body[index].findall('.//a:blip',NS)):
                parents={child:parent for parent in body[index].iter() for child in parent}
                ancestor=blip
                while ancestor in parents and ancestor.tag.split('}')[-1] not in ('anchor','inline'):ancestor=parents[ancestor]
                extent=ancestor.find('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent')
                shape=blip
                while shape in parents and shape.tag.split('}')[-1] not in ('spPr','pic'):shape=parents[shape]
                shape_extent=shape.find('.//{'+NS['a']+'}xfrm/{'+NS['a']+'}ext')
                if shape_extent is not None:extent=shape_extent
                caption=group.get('captions',[None]*len(group['blocks']))[i]
                manifest['images'].append({'id':f'image_{index}_{occurrence}','label':group['labels'][i]+(f' — foto {occurrence+1}' if len(body[index].findall('.//a:blip',NS))>1 else ''),'blockIndex':index,'occurrence':occurrence,'originalRelationship':blip.get('{'+NS['r']+'}embed'),'captionId':caption,'captionFieldId':caption,'group':group['group'],'section':group['group'],'widthEmu':int(extent.get('cx')) if extent is not None else None,'heightEmu':int(extent.get('cy')) if extent is not None else None,'required':not group.get('optional',False)})
    manifest['sections']=[ET.tostring(n,encoding='unicode') for n in document.findall('.//w:sectPr',NS)]
    return manifest
