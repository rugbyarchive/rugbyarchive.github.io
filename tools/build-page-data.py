"""Generate small supporting-page payloads from the published archive, never the master."""
from pathlib import Path
import json,re,hashlib,sys
from datetime import date

def build(site):
    source=site/'data/archive-data.js'
    data=json.loads(source.read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
    fields={name:i for i,name in enumerate(data['fields'])};look=data['lookups'];buckets=[{} for _ in range(64)]
    def bucket(key):
        h=0
        for c in key:h=(h*31+ord(c))&0xffffffff
        return h%64
    def team(row,side):
        era=row[fields[side+'_as']]
        return look['team_era'][era] if era is not None and look.get('team_era') else look['teams'][row[fields[side]]]
    for row in data['rows']:
        key=row[fields['match_id']]
        buckets[bucket(key)][key]=[row[fields['date']],team(row,'home'),row[fields['home_score']],row[fields['away_score']],team(row,'away')]
    folder=site/'data/report';folder.mkdir(exist_ok=True)
    urls=[]
    for i,rows in enumerate(buckets):
        payload='window.RUGBY_REPORT_ROWS='+json.dumps(rows,ensure_ascii=False,separators=(',',':'))+';\n'
        target=folder/f'{i:02d}.js';target.write_text(payload,encoding='utf-8',newline='\n')
        urls.append(f'data/report/{i:02d}.js?v='+hashlib.sha256(target.read_bytes()).hexdigest()[:16])
    legacy=site/'data/legacy-match-links.js'
    meta={'meta':data['meta'],'report_shards':urls,'legacy_url':'data/legacy-match-links.js?v='+hashlib.sha256(legacy.read_bytes()).hexdigest()[:16]}
    (site/'data/page-meta.js').write_text('window.RUGBY_PAGE_META='+json.dumps(meta,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8',newline='\n')
    p=site/'about.html';html=p.read_text(encoding='utf-8')
    for key in ['matches','teams','breakdown_coverage']:
        html=re.sub(r'(data-stat="'+key+r'">)[^<]*',lambda m:m[1]+format(data['meta'][key],','),html)
    last=date.fromisoformat(data['meta']['last_match']);display=f'{last.day} {last.strftime("%B %Y")}'
    html=re.sub(r'(<span id="about-latest">)[^<]*',lambda m:m[1]+display,html);p.write_text(html,encoding='utf-8',newline='\n')
    p=site/'README.md';text=p.read_text(encoding='utf-8')
    summary=f"**{data['meta']['matches']:,} matches · {data['meta']['teams']:,} teams · latest recorded match {data['meta']['last_match']}**"
    text=re.sub(r'\*\*[\d,]+ matches[^\n]+\*\*',lambda _:summary,text)
    text=re.sub(r'Built .*? from `Historical Rugby Results.xlsx`\.', 'Coverage generated from the published archive. See the site for source notes and limitations.',text)
    p.write_text(text,encoding='utf-8',newline='\n')
    return meta

if __name__=='__main__':build(Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parent.parent)
