import json
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
def read_config(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))
def read_template(path):
    raw=Path(path).read_bytes()
    with ZipFile(path) as archive:
        document=ET.fromstring(archive.read('word/document.xml'))
        return raw, document, archive.namelist()
def read_package(raw):
    from io import BytesIO
    with ZipFile(BytesIO(raw)) as archive:
        document=ET.fromstring(archive.read('word/document.xml'))
        return document,archive.namelist()
