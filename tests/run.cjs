const {spawnSync}=require('node:child_process');
const path=require('node:path');
for(const name of ['safe-html','share-links','accessibility','supporting-pages']){
  const result=spawnSync(process.execPath,[path.join(__dirname,name+'.cjs')],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
