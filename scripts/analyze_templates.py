"""Read-only OOXML inventory of authoritative sismography report references."""
from pathlib import Path
from zipfile import ZipFile
import json
import hashlib
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis'
NS = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships','wp':'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing','v':'urn:schemas-microsoft-com:vml'}
def text(el):
    return ''.join(n.text or '' for n in el.findall('.//w:t',NS))
def analyze(path):
    result={'path':str(path.relative_to(ROOT)), 'size':path.stat().st_size, 'sha256':hashlib.file_digest(path.open('rb'),'sha256').hexdigest()}
    with ZipFile(path) as z:
        doc=ET.fromstring(z.read('word/document.xml'))
        body=doc.find('w:body',NS)
        blocks=[]
        for i,el in enumerate(body):
            tag=el.tag.split('}')[-1]
            b={'index':i,'type':tag}
            if tag=='tbl':
                b['rows']=[[text(c) for c in row.findall('w:tc',NS)] for row in el.findall('w:tr',NS)]
            else:b['text']=text(el)
            b['images']=[n.attrib for n in el.findall('.//a:blip',NS)]
            b['vml_images']=[n.attrib for n in el.findall('.//v:imagedata',NS)]
            b['extents']=[n.attrib for n in el.findall('.//wp:extent',NS)]
            blocks.append(b)
        result['blocks']=blocks
        result['sections']=[ET.tostring(n,encoding='unicode') for n in doc.findall('.//w:sectPr',NS)]
        result['media']=[{'name':n,'size':z.getinfo(n).file_size} for n in z.namelist() if n.startswith('word/media/')]
        result['other_parts']={n:text(ET.fromstring(z.read(n))) for n in z.namelist() if n.startswith(('word/header','word/footer')) and n.endswith('.xml')}
        result['relationships']=z.read('word/_rels/document.xml.rels').decode()
    return result
def main():
    OUT.mkdir(exist_ok=True)
    paths=sorted((ROOT/'EXEMPLOS').rglob('*R.334*.docx'))
    results=[analyze(p) for p in paths]
    (OUT/'template-inventory.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
    for i,r in enumerate(results):
        lines=[r['path'],f"SHA256 {r['sha256']}"]
        for b in r['blocks']:
            lines.append(f"\nBLOCK {b['index']} {b['type']}")
            if 'rows' in b:
                lines.extend(f"ROW {j}: "+' | '.join(row) for j,row in enumerate(b['rows']))
            else:lines.append(b.get('text',''))
            if b['images']:lines.append('IMAGES '+json.dumps(b['images']))
            if b['vml_images']:lines.append('VML_IMAGES '+json.dumps(b['vml_images']))
        lines.append('\nHEADERS/FOOTERS '+json.dumps(r['other_parts'],ensure_ascii=False))
        (OUT/f'reference-{i}.txt').write_text('\n'.join(lines),encoding='utf-8')
    print(json.dumps([{'file':r['path'],'blocks':len(r['blocks']),'tables':sum(b['type']=='tbl' for b in r['blocks']),'images':len(r['media'])} for r in results],ensure_ascii=False,indent=2))
if __name__=='__main__':main()
