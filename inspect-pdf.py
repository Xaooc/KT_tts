from pathlib import Path
from pypdf import PdfReader
p = Path(r'C:\Users\PC\Documents\My Games\Tabletop Simulator\Mods\PDF')
out = Path(r'C:\dev\KT\inventory')
for i, f in enumerate(p.glob('*.pdf')):
    reader = PdfReader(f)
    pages = [page.extract_text() or '' for page in reader.pages]
    out.joinpath(f'cached-pdf-{i}.txt').write_text('\n\n'.join(pages), encoding='utf-8')
    print(f.name, 'pages', len(pages), 'first:', pages[0][:900])
