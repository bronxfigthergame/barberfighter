from pathlib import Path
import json,struct,sys
root=Path(__file__).resolve().parents[1]
required=['index.html','src/game.js','src/style.css','assets/stages/bronx.jpg','assets/stages/boss.png','assets/cinematics/boss_intro.mp4']
for fighter in ['daniel','diana','kadu','bruno','christian','luana','lorehy']:
 required += [f'assets/fighters/{fighter}/atlas.json',f'assets/fighters/{fighter}/atlas.png',f'assets/fighters/{fighter}/portraits/large.png']
required += [str(p.relative_to(root)) for base in ('assets','music') for p in (root/base).rglob('*') if p.is_file()]
errors=[]
for rel in set(required):
 p=root/rel
 if not p.is_file() or p.stat().st_size<24:errors.append(f'Ausente ou vazio: {rel}');continue
 b=p.open('rb').read(24)
 if p.suffix=='.png' and not b.startswith(b'\x89PNG\r\n\x1a\n'):errors.append(f'PNG invalido: {rel}')
 if p.suffix in ('.jpg','.jpeg') and not b.startswith(b'\xff\xd8\xff'):errors.append(f'JPEG invalido: {rel}')
 if p.suffix=='.webp' and (not b.startswith(b'RIFF') or b[8:12]!=b'WEBP'):errors.append(f'WebP invalido: {rel}')
 if p.name=='atlas.json':
  try: json.loads(p.read_text(encoding='utf-8'))
  except Exception as e:errors.append(f'Atlas invalido: {rel}: {e}')
print('Arquivos checados:',len(set(required)))
if errors:
 print('\n'.join(errors));sys.exit(1)
print('ASSETS VALIDOS - imagens, personagens, cenarios e sons presentes')
