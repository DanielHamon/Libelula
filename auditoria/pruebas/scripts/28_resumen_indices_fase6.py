"""Resume EXPLAIN locales; descarta calentamiento (repetición cero)."""
import json
from pathlib import Path
from statistics import median
from collections import defaultdict
root=Path(__file__).resolve().parent.parent/'resultados/fase6/aud007'
objects=[json.loads(line) for line in (root/'planes.log').read_text().splitlines() if line.startswith('{')]
data=next(x for x in objects if 'mediciones' in x)
restauracion=next(x for x in objects if 'respuestas_preservadas' in x)
assert restauracion=={'respuestas_preservadas':1500,'indices_experimentales_restantes':0},restauracion
buckets=defaultdict(list)
for row in data['mediciones']:
 if row['repeticion']>0: buckets[(row['escenario'],row['caso'],row['etapa'])].append(row['plan'][0])
def indexes(node):
 return ([node['Index Name']] if 'Index Name' in node else [])+[x for child in node.get('Plans',[]) for x in indexes(child)]
summary=[]
for (scenario,case,stage),plans in buckets.items():
 summary.append({'escenario':scenario,'caso':case,'etapa':stage,'repeticiones':len(plans),
 'mediana_ms':median(p['Execution Time'] for p in plans),
 'filas':sorted(set(p['Plan']['Actual Rows'] for p in plans)),
 'bloques_mediana':median(sum(p['Plan'].get(k,0) for k in ['Shared Hit Blocks','Shared Read Blocks','Local Hit Blocks','Local Read Blocks']) for p in plans),
 'indices':sorted(set(i for p in plans for i in indexes(p['Plan'])))})
for s in summary:
 if s['etapa']=='antes':
  after=next(x for x in summary if x['escenario']==s['escenario'] and x['caso']==s['caso'] and x['etapa']=='despues')
  assert s['filas']==after['filas']
report={'resumen':summary,'restauracion':restauracion,'indices_sinteticos':data['indices_sinteticos'],'indices_fixtures':data['indices_fixtures']}
(root/'resumen.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
for s in summary: print(s)
print(restauracion)
print('Indices sintéticos:', data['indices_sinteticos'])
