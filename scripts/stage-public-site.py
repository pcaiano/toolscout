"""Stage GitHub Pages without server code or private operational files."""
import pathlib, shutil, json
root = pathlib.Path(__file__).resolve().parents[1]
out = root / '.pages-public'
if out.exists():
    shutil.rmtree(out)
excluded_dirs = {'.git', '.github', '.wrangler', '.pages-public', 'docs', 'scripts', 'tests', 'migrations', 'worker', 'workers', 'node_modules'}
private_data = {'affiliate-pipeline.json', 'affiliate-queue.json', 'business-intelligence.json', 'business-intelligence-history.json'}
for source in root.rglob('*'):
    relative = source.relative_to(root)
    if any(part in excluded_dirs for part in relative.parts) or not source.is_file():
        continue
    if source.suffix in {'.toml', '.sql', '.py', '.mjs'} or source.name in {'AGENTS.md', 'README.md'}:
        continue
    if len(relative.parts) == 1 and source.suffix == '.js' and source.name not in {'app.js', 'seo-page.js'}:
        continue
    if relative.parts[0] == 'data' and source.name in private_data:
        continue
    if source.name.startswith('.') and relative.parts[0] != '.well-known':
        continue
    target = out / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    if str(relative) in {'data/tools.json', 'data/pending-affiliate-tools.json'}:
        tools = json.loads(source.read_text())
        for tool in tools:
            for key in ['commission', 'affiliateProgram', 'affiliateUrl']:
                tool.pop(key, None)
        target.write_text(json.dumps(tools, ensure_ascii=False))
    else:
        shutil.copy2(source, target)
print('Public Pages artifact staged.')
