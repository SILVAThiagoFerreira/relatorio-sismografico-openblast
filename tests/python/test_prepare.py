import hashlib
import json
from pathlib import Path
import unittest
from zipfile import ZipFile
from io import BytesIO
from src.reader import read_config,read_template,read_package
from src.validation import validate_config,validate_template
from src.processing import build_manifest
from src.sanitization import sanitize_template
ROOT=Path(__file__).resolve().parents[2]
class PreparationTests(unittest.TestCase):
    def test_authoritative_contract(self):
        config=read_config(ROOT/'config.json');validate_config(config)
        source,source_document,source_parts=read_template(ROOT/config['template_path'])
        validate_template(source_document,source_parts,config)
        raw=sanitize_template(source,config)
        document,parts=read_package(raw)
        manifest=build_manifest(config,raw,document,validate_template(document,parts,config))
        self.assertEqual(len(manifest['tables']),7)
        self.assertEqual(manifest['template']['sha256'],hashlib.sha256(raw).hexdigest())
        self.assertEqual(len([i for i in manifest['images'] if i['blockIndex']==158]),2)
        self.assertFalse(any(i['blockIndex'] in (57,61) for i in manifest['images']))
        engineer=next(t for t in manifest['tables'] if t['id']=='engineer')
        self.assertEqual(engineer['rows'][0][:3],['Nome','Cargo/Função','Nº CREA'])
        self.assertEqual(engineer['rows'][1][:3],['','',''])
        self.assertEqual(next(f for f in manifest['fields'] if f['id']=='conclusion')['default'],'')
    def test_public_template_is_sanitized_copy_and_source_is_untouched(self):
        config=read_config(ROOT/'config.json')
        source=(ROOT/config['template_path']).read_bytes()
        public=(ROOT/config['output_directory']/config['template_name']).read_bytes()
        self.assertNotEqual(source,public)
        with ZipFile(BytesIO(public)) as archive:
            document=archive.read('word/document.xml').decode('utf-8')
            self.assertNotIn('Luan Carlos Silva Pereira',document)
            self.assertNotIn('1421141833',document)
            self.assertNotIn('21/11/2025',document)
            self.assertNotIn('PP 120A1025',document)
            self.assertNotIn('Foram verificados os valores de vibração',document)
            self.assertNotIn('Também não se identificou ultralançamento',document)
            signature=archive.read('word/media/image5.png')
            self.assertEqual(signature,bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082'))
    def test_rejects_invalid_config(self):
        config=read_config(ROOT/'config.json');config['limits']['max_image_bytes']=0
        with self.assertRaises(ValueError):validate_config(config)
if __name__=='__main__':unittest.main()
