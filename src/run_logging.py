import logging
from datetime import datetime,timezone
def start_log(root,directory):
    folder=root/directory;folder.mkdir(parents=True,exist_ok=True)
    path=folder/('prepare-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.log')
    logging.basicConfig(filename=path,level=logging.INFO,format='%(asctime)s %(levelname)s %(message)s',force=True)
    return logging.getLogger('prepare'),path
