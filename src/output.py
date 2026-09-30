import json
from pathlib import Path
def write_outputs(config,raw,manifest,root):
    directory=root/config['output_directory'];directory.mkdir(parents=True,exist_ok=True)
    (directory/config['template_name']).write_bytes(raw)
    (directory/config['manifest_name']).write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return directory
