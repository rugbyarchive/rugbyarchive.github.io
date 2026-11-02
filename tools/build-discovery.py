"""Small static discovery pilot; uses only published fixture records."""
from pathlib import Path
import json,re,hashlib,html
from datetime import date
from urllib.parse import quote

def build(site):
 data=json.loads((site/'data/archive-data.js').read_text(encoding='utf-8').split('=',1)[1].strip().rstrip(';'))
 f={n:i for i,n in enumerate(data['fields'])};teams=data['lookups']['teams'];esc=html.escape
 template=(site/'about.html').read_text(encoding='utf-8');head=template.split('</head>')[0]+'</head>';header=template.split('<header class="topbar">')[1].split('</header>')[0] if '<header class="topbar">' in template else None
 # Reuse the established header, avoiding a misleading current-page marker.
 start=template.index('<header');end=template.index('</header>',start)+len('</header>');nav=template[start:end];nav=re.sub(r' class="here"| aria-current="page"','',nav)
 specs=[('team/fiji.html','Fiji',None),('team/japan.html','Japan',None),('team/south-africa.html','South Africa',None),('rivalry/japan-fiji.html','Japan','Fiji'),('rivalry/france-new-zealand.html','France','New Zealand'),('rivalry/australia-south-africa.html','Australia','South Africa')]
 pages=[]
 for filename,a,b in specs:
  ai=teams.index(a);bi=teams.index(b) if b else None
  rows=[r for r in data['rows'] if ai in [r[f['home']],r[f['away']]] and (bi is None or bi in [r[f['home']],r[f['away']]])]
  rows.sort(key=lambda r:(r[f['date']],r[f['match_id']]),reverse=True)
  won=drawn=lost=0
  for r in rows:
   diff=r[f['home_score']]-r[f['away_score']];diff=diff if r[f['home']]==ai else -diff
   won+=diff>0;drawn+=diff==0;lost+=diff<0
  title=a+(' v '+b if b else '')+' rugby results';desc=f'{len(rows):,} recorded matches; {a} won {won:,}, drew {drawn:,} and lost {lost:,}. Explore recorded scores and source notes.'
  pagehead=re.sub(r'<title>.*?</title>','<title>'+esc(title)+" — Nuck’s Rugby Archive</title>",head)
  pagehead=re.sub(r'(<meta (?:name="description"|property="og:description") content=")[^"]*',lambda m:m[1]+esc(desc),pagehead)
  pagehead=re.sub(r'(<meta property="og:title" content=")[^"]*',lambda m:m[1]+esc(title),pagehead)
  pagehead=re.sub(r'(<link rel="canonical" href=")[^"]*',lambda m:m[1]+'https://rugbyarchive.github.io/'+filename,pagehead)
  pagehead=pagehead.replace('<head>','<head><base href="/">')
  url='head-to-head.html#a='+quote(a)+'&b='+quote(b) if b else 'index.html#team='+quote(a)
  table=''
  for r in rows[:12]:
   def name(s):
    era=r[f[s+'_as']];return data['lookups']['team_era'][era] if era is not None else teams[r[f[s]]]
   table+='<tr><td>'+esc(r[f['date']])+'</td><td><a href="index.html#match='+quote(r[f['match_id']])+'">'+esc(name('home'))+' '+str(r[f['home_score']])+'–'+str(r[f['away_score']])+' '+esc(name('away'))+'</a></td></tr>'
  body='<main class="about"><h1>'+esc(title)+'</h1><p>'+esc(desc)+'</p><p>Coverage: '+rows[-1][f['date']]+' to '+rows[0][f['date']]+'. Scores are as played. This is the archive’s recorded selection, not a claim that every fixture or field is complete.</p><p><a class="ghostbtn" href="'+esc(url)+'">Explore all these matches</a></p><h2>Latest recorded meetings</h2><div class="insight-scroll" tabindex="0" aria-label="Latest recorded matches"><table><thead><tr><th scope="col">Date</th><th scope="col">Match and full record</th></tr></thead><tbody>'+table+'</tbody></table></div><p>Statistics are from '+esc(a)+"’s point of view. Historical names follow the match record; team selection follows the archive’s team lineage.</p><p><a href=\"about.html#scope\">Scope and sources</a> · <a href=\"discover.html\">More teams and rivalries</a></p></main>"
  text=pagehead+'<body>'+nav+body+'<script src="assets/mobile.js" defer></script></body></html>';target=site/filename;target.parent.mkdir(exist_ok=True);target.write_text(text,encoding='utf-8',newline='\n');pages.append((filename,title,len(rows)))
 links=''.join('<li><a href="'+p+'">'+esc(title)+'</a> · '+str(n)+' recorded matches</li>' for p,title,n in pages)
 dh=re.sub(r'<title>.*?</title>','<title>Explore teams and rivalries — Nuck’s Rugby Archive</title>',head)
 dh=re.sub(r'(<meta property="og:title" content=")[^"]*',lambda m:m[1]+'Explore teams and rivalries',dh)
 dh=re.sub(r'(<link rel="canonical" href=")[^"]*',lambda m:m[1]+'https://rugbyarchive.github.io/discover.html',dh)
 dh=re.sub(r'(<meta (?:name="description"|property="og:description") content=")[^"]*',lambda m:m[1]+'Explore recorded rugby results by team and rivalry, with links to full match records.',dh)
 (site/'discover.html').write_text(dh+'<body>'+nav+'<main class="about"><h1>Explore teams and rivalries</h1><p>A first selection of archive summaries. The interactive tools cover the full archive.</p><ul>'+links+'</ul><p><a href="index.html">Explore every recorded match</a></p></main><script src="assets/mobile.js" defer></script></body></html>',encoding='utf-8',newline='\n')
 for name in ['index','about']:
  p=site/(name+'.html');s=p.read_text(encoding='utf-8');s=re.sub(r'<noscript><p id="discovery-links">.*?</p></noscript>','',s,flags=re.S);s=re.sub(r'<p id="discovery-links">.*?</p>','',s,flags=re.S)
  discovery='<p id="discovery-links"><a class="ghostbtn" href="discover.html">Explore team histories and rivalries</a></p>'
  s=s.replace('</main>',('</main><noscript>'+discovery+'</noscript>') if name=='index' else (discovery+'</main>'))
  dataset={'@context':'https://schema.org','@type':'Dataset','name':"Nuck’s Rugby Archive",'description':"An evolving sourced archive of men’s rugby fixtures. Coverage and individual fields may be incomplete.",'url':'https://rugbyarchive.github.io/','temporalCoverage':min(r[f['date']] for r in data['rows'])+'/'+data['meta']['last_match'],'distribution':{'@type':'DataDownload','contentUrl':'https://rugbyarchive.github.io/data/archive-data.js','encodingFormat':'application/javascript'}}
  s=re.sub(r'<script id="archive-dataset".*?</script>','',s,flags=re.S)
  s=s.replace('</head>','<script id="archive-dataset" type="application/ld+json">'+json.dumps(dataset,ensure_ascii=False).replace('<','\\u003c')+'</script>\n</head>');s=re.sub(r'\n{3,}','\n\n',s);p.write_text(s,encoding='utf-8',newline='\n')
 # lastmod changes only when non-cache-key page content changes.
 statefile=site/'data/discovery-state.json';old=json.loads(statefile.read_text()) if statefile.exists() else {};state={};urls=[]
 for filename in ['index.html','about.html','head-to-head.html','rankings.html','scoring.html','discover.html']+[p for p,_,_ in pages]:
  raw=(site/filename).read_text(encoding='utf-8');raw=re.sub(r'\?v=[a-f0-9]{16}','',raw);raw=re.sub(r'>\s+<','><',raw)
  digest=hashlib.sha256(raw.encode()).hexdigest();prior=old.get(filename,{})
  modified=prior['lastmod'] if prior.get('sha256')==digest else date.today().isoformat();state[filename]={'sha256':digest,'lastmod':modified}
  loc='https://rugbyarchive.github.io/'+('' if filename=='index.html' else filename);urls.append('<url><loc>'+loc+'</loc><lastmod>'+modified+'</lastmod></url>')
 statefile.write_text(json.dumps(state,indent=2),encoding='utf-8');(site/'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+'\n'.join(urls)+'\n</urlset>\n',encoding='utf-8')

if __name__=='__main__':build(Path(__file__).resolve().parent.parent)
