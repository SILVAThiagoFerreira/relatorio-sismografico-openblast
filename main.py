"""Orchestrate validated extraction of the authoritative report contract."""
import argparse
from pathlib import Path
from src.reader import read_config,read_template,read_package
from src.validation import validate_config,validate_template
from src.processing import build_manifest
from src.output import write_outputs
from src.sanitization import sanitize_template
from src.run_logging import start_log
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--config',default='config.json');args=parser.parse_args()
    root=Path(__file__).resolve().parent
    config=read_config(root/args.config);validate_config(config)
    log,path=start_log(root,config['log_directory'])
    try:
        log.info('Reading original template %s',config['template_path'])
        source_raw,source_doc,source_parts=read_template(root/config['template_path'])
        validate_template(source_doc,source_parts,config)
        log.info('Sanitizing stale variable data and the template signature for the public copy')
        raw=sanitize_template(source_raw,config)
        doc,parts=read_package(raw)
        body=validate_template(doc,parts,config)
        manifest=build_manifest(config,raw,doc,body)
        out=write_outputs(config,raw,manifest,root)
        log.info('Success SHA256 %s fields=%d tables=%d images=%d',manifest['template']['sha256'],len(manifest['fields']),len(manifest['tables']),len(manifest['images']))
        print(f'Prepared {out}; log {path}')
    except Exception:
        log.exception('Preparation failed');raise
if __name__=='__main__':main()
