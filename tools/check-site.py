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
if not (root/'node_modules/playwright').exists() and (runtime/'node_modules/playwright').exists():
    env['NODE_PATH']=str(runtime/'node_modules')
subprocess.run([node,str(root/'tests/run.cjs')],cwd=root,env=env,check=True)
