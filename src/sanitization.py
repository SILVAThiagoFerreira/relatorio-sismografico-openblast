"""Create a publication-safe model copy without changing the source document."""
from io import BytesIO
from zipfile import ZipFile, ZIP_DEFLATED
import xml.etree.ElementTree as ET
import re

from .reader import NS

R = NS['r']
PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
W = NS['w']
A = NS['a']
TRANSPARENT_PNG = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
    '0000000b49444154789c636000020000050001a5f645400000000049454e44ae426082'
)


def _register_source_namespaces(raw: bytes) -> None:
    for _, (prefix, uri) in ET.iterparse(BytesIO(raw), events=('start-ns',)):
        try:
            ET.register_namespace(prefix or '', uri)
        except ValueError:
            continue


def _serialize_preserving_root_namespaces(root: ET.Element, source_xml: bytes) -> bytes:
    serialized = ET.tostring(root, encoding='utf-8', xml_declaration=True)
    source_root = re.search(rb'<([A-Za-z_][\w.:-]*)([^>]*)>', source_xml)
    output_root = re.search(rb'<([A-Za-z_][\w.:-]*)([^>]*)>', serialized)
    if not source_root or not output_root:
        raise ValueError('Não foi possível preservar os namespaces do XML OOXML')
    declarations = re.findall(rb'\sxmlns(?::([\w.-]+))?="([^"]+)"', source_root.group(2))
    present = set((prefix or b'').decode('utf-8') for prefix in re.findall(rb'\sxmlns(?::([\w.-]+))?=', output_root.group(2)))
    missing = b''.join(b' xmlns' + (b':' + prefix if prefix else b'') + b'="' + uri + b'"' for prefix, uri in declarations if (prefix or b'').decode('utf-8') not in present)
    return serialized[:output_root.end(1)] + missing + serialized[output_root.end(1):]


def _write_paragraph_value(node: ET.Element, value: str) -> None:
    text_nodes = node.findall('.//w:t', NS)
    if text_nodes:
        text_nodes[0].text = value
        for text_node in text_nodes[1:]:
            text_node.text = ''
        return
    paragraph = node if node.tag == f'{{{W}}}p' else node.find('.//w:p', NS)
    if paragraph is None:
        raise ValueError('Campo de sanitização sem parágrafo editável')
    run = ET.SubElement(paragraph, f'{{{W}}}r')
    ET.SubElement(run, f'{{{W}}}t').text = value


def _replace_text(node: ET.Element, needle: str, replacement: str) -> None:
    text_nodes = node.findall('.//w:t', NS)
    full = ''.join(text.text or '' for text in text_nodes)
    if not needle or needle not in full:
        raise ValueError(f'Texto sensível não encontrado no modelo: {needle!r}')
    spans = []
    offset = 0
    for text in text_nodes:
        value = text.text or ''
        spans.append((text, offset, offset + len(value), value))
        offset += len(value)
    matches = []
    start = 0
    while (start := full.find(needle, start)) >= 0:
        matches.append((start, start + len(needle)))
        start += len(needle)
    for start, end in reversed(matches):
        first = next((span for span in spans if span[1] <= start < span[2]), None)
        last = next((span for span in reversed(spans) if span[1] < end <= span[2]), None)
        if first is None or last is None:
            raise ValueError('O texto de sanitização cruza nós OOXML inválidos')
        if first is last:
            first[0].text = first[3][:start-first[1]] + replacement + first[3][end-first[1]:]
        else:
            first[0].text = first[3][:start-first[1]] + replacement
            for text, span_start, span_end, _ in spans:
                if first[1] < span_start < last[1]:
                    text.text = ''
            last[0].text = last[3][end-last[1]:]


def sanitize_template(raw: bytes, config: dict) -> bytes:
    """Strip stale report data and private signature pixels from the public model."""
    source = BytesIO(raw)
    output = BytesIO()
    with ZipFile(source) as original:
        _register_source_namespaces(original.read('word/document.xml'))
        names = original.namelist()
        document = ET.fromstring(original.read('word/document.xml'))
        body = list(document.find('w:body', NS))

        for field_id, value in config.get('sanitization', {}).get('fields', {}).items():
            field = next((field for field in config['fields'] if field['id'] == field_id), None)
            if field is None:
                raise ValueError(f'Campo de sanitização não configurado: {field_id}')
            _write_paragraph_value(body[field['blockIndex']], value)

        replacements = config.get('sanitization', {}).get('text_replacements', {})
        for field_id, rule in replacements.items():
            field = next((field for field in config['fields'] if field['id'] == field_id), None)
            if field is None:
                raise ValueError(f'Reposição de texto não configurada: {field_id}')
            _replace_text(body[field['blockIndex']], rule['from'], rule['to'])
            field['replacement'] = rule['to']

        for table_config in config['tables']:
            clear = table_config.get('clearColumns', [])
            if not clear:
                continue
            table = body[table_config['blockIndex']]
            rows = table.findall('w:tr', NS)[table_config.get('headerRows', 0):]
            for row in rows:
                cells = row.findall('w:tc', NS)
                for index in clear:
                    if index < len(cells):
                        _write_paragraph_value(cells[index], '')

        relationship_overrides = {}
        relationship_root = ET.fromstring(original.read('word/_rels/document.xml.rels'))
        id_to_target = {rel.get('Id'): rel.get('Target') for rel in relationship_root.findall(f'{{{PKG_REL}}}Relationship')}
        for group in config['image_groups']:
            if not group.get('sanitizePixels'):
                continue
            for block_index in group['blocks']:
                for blip in body[block_index].findall('.//a:blip', NS):
                    rel_id = blip.get(f'{{{R}}}embed')
                    target = id_to_target.get(rel_id)
                    if not target:
                        raise ValueError(f'Relação da assinatura ausente: {rel_id}')
                    package_target = target.lstrip('/') if target.startswith('/') else f'word/{target}'
                    relationship_overrides[package_target] = TRANSPARENT_PNG

        source_document_xml = original.read('word/document.xml')
        replacements_xml = {'word/document.xml': _serialize_preserving_root_namespaces(document, source_document_xml)}
        for name, value in relationship_overrides.items():
            replacements_xml[name] = value

        if 'docProps/core.xml' in names:
            source_core_xml = original.read('docProps/core.xml')
            _register_source_namespaces(source_core_xml)
            core = ET.fromstring(source_core_xml)
            cleared = set(config.get('sanitization', {}).get('clear_core_properties', []))
            for element in list(core.iter()):
                local = element.tag.split('}')[-1]
                if local not in cleared:
                    continue
                if local == 'revision':
                    element.text = '1'
                elif local == 'lastPrinted':
                    parent = next((candidate for candidate in core.iter() if element in list(candidate)), None)
                    if parent is not None:
                        parent.remove(element)
                else:
                    element.text = ''
            replacements_xml['docProps/core.xml'] = _serialize_preserving_root_namespaces(core, source_core_xml)

        if 'docProps/app.xml' in names:
            source_app_xml = original.read('docProps/app.xml')
            _register_source_namespaces(source_app_xml)
            app = ET.fromstring(source_app_xml)
            cleared = set(config.get('sanitization', {}).get('clear_app_properties', []))
            for element in list(app.iter()):
                if element.tag.split('}')[-1] in cleared:
                    parent = next((candidate for candidate in app.iter() if element in list(candidate)), None)
                    if parent is not None:
                        parent.remove(element)
            replacements_xml['docProps/app.xml'] = _serialize_preserving_root_namespaces(app, source_app_xml)

        if config.get('sanitization', {}).get('clear_custom_properties') and 'docProps/custom.xml' in names:
            source_custom_xml = original.read('docProps/custom.xml')
            _register_source_namespaces(source_custom_xml)
            custom = ET.fromstring(source_custom_xml)
            for element in custom.iter():
                if element is not custom:
                    element.text = ''
            replacements_xml['docProps/custom.xml'] = _serialize_preserving_root_namespaces(custom, source_custom_xml)

        with ZipFile(output, 'w', compression=ZIP_DEFLATED) as sanitized:
            for entry in original.infolist():
                content = replacements_xml.get(entry.filename)
                if content is None:
                    content = original.read(entry.filename)
                sanitized.writestr(entry, content)
    return output.getvalue()
