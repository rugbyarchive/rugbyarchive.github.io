"""Run the maintained browser suite before publication; missing tools fail explicitly."""
from pathlib import Path
import os,shutil,subprocess

root=Path(__file__).resolve().parent.parent
runtime=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node'
node=shutil.which('node')
if not node:
    candidate=runtime/'bin/node.exe'
    if candidate.is_file():node=str(candidate)
if not node:raise SystemExit('Node.js is required for publication tests. Install Node and the declared development dependencies.')
env=os.environ.copy()
candidates=[root/'node_modules']+[p/'live-site/node_modules' for p in root.parents]+[runtime/'node_modules']
modules=next((p for p in candidates if (p/'playwright').exists() and (p/'eslint/bin/eslint.js').exists()),None)
if modules is None:raise SystemExit('Install the declared development dependencies with npm install before publication.')
env['NODE_PATH']=str(modules)
subprocess.run([node,str(modules/'eslint/bin/eslint.js'),'assets','tests'],cwd=root,env=env,check=True)
subprocess.run([node,str(modules/'prettier/bin/prettier.cjs'),'--check','tests/*.cjs','docs/*.md'],cwd=root,env=env,check=True)
subprocess.run([node,str(root/'tests/run.cjs')],cwd=root,env=env,check=True)
