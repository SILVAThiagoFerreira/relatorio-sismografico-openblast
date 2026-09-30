from .reader import NS
def validate_config(config):
    for key in ('schema_version','template_path','output_directory','fields','tables','image_groups','limits','visual','sanitization'):
        if key not in config:raise ValueError(f'Configuração sem {key}')
    ids=[f['id'] for f in config['fields']]+[t['id'] for t in config['tables']]
    if len(ids)!=len(set(ids)):raise ValueError('Identificadores de campos/tabelas duplicados')
    for key in ('max_image_bytes','max_project_bytes'):
        if not isinstance(config['limits'].get(key),int) or config['limits'][key]<=0:raise ValueError(f'Limite inválido: {key}')
def validate_template(document,parts,config):
    for part in ('word/document.xml','word/styles.xml','word/_rels/document.xml.rels','[Content_Types].xml'):
        if part not in parts:raise ValueError(f'Parte OOXML ausente: {part}')
    body=list(document.find('w:body',NS))
    for field in config['fields']:
        if body[field['blockIndex']].tag != '{'+NS['w']+'}p':raise ValueError(f"Campo {field['id']} não é parágrafo")
    for table in config['tables']:
        if body[table['blockIndex']].tag != '{'+NS['w']+'}tbl':raise ValueError(f"Tabela {table['id']} ausente")
    for group in config['image_groups']:
        if len(group['blocks'])!=len(group['labels']):raise ValueError('Quantidade de imagens/legendas inconsistente')
        for index in group['blocks']:
            if not body[index].findall('.//a:blip',NS):raise ValueError(f'Imagem ausente no bloco {index}')
    return body
