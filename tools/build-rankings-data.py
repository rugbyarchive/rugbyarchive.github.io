"""Split the canonical rankings export without changing any published values."""
from pathlib import Path
import json
import sys

def build(site):
    data = json.loads((site/'data/rankings-data.js').read_text(encoding='utf-8').split('=', 1)[1].strip().rstrip(';'))
    official = data.pop('official', {})
    for filename, variable, value in [('rankings-core.js', 'RUGBY_RANKINGS', data), ('rankings-official.js', 'RUGBY_OFFICIAL', official)]:
        (site/'data'/filename).write_text('window.'+variable+'='+json.dumps(value, ensure_ascii=False, separators=(',', ':'))+';\n', encoding='utf-8', newline='\n')

if __name__ == '__main__':
    build(Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent.parent)
