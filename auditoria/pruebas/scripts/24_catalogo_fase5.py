"""Compara metadatos guardados; sin conexión ni modificación de bases."""
import json
from pathlib import Path
r=Path(__file__).resolve().parent.parent/'resultados/fase5'
cloud=json.loads((r/'catalogo-produccion.json').read_text())['rows'][0]['catalogo']
local=json.loads((r/'iabooks-auditoria-fase5-catalogo.json').read_text())
acl_cloud=json.loads((r/'acl-produccion.json').read_text())['rows'][0]['acl']
acl_local=json.loads((r/'iabooks-auditoria-fase5-acl-completo.json').read_text())
keys={'triggers':['schema','table','name'],'policies':['schemaname','tablename','policyname'],'tables':['name'],'functions':['name','signature'],'indexes':['tablename','indexname'],'default_privileges':['owner','schema','type']}
report={}
for section,cols in keys.items():
    def index(rows):
        return {str(tuple(x.get(k) for k in cols)):{k:v for k,v in x.items() if k!='definition_md5'} for x in rows or []}
    x,y=index(cloud[section]),index(local[section])
    report[section]={'solo_produccion':sorted(x.keys()-y.keys()),'solo_local':sorted(y.keys()-x.keys()),'diferentes':[k for k in sorted(x.keys()&y.keys()) if x[k]!=y[k]]}
# Comparación textual completa, solo normaliza CRLF/LF; no elimina lógica ni comentarios.
x={f['nombre']:f['definicion'].replace('\r\n','\n') for f in acl_cloud['funciones']}
y={f['nombre']:f['definicion'].replace('\r\n','\n') for f in acl_local['funciones']}
report['definiciones_funciones']={'diferentes':[k for k in sorted(x.keys()|y.keys()) if x.get(k)!=y.get(k)]}
key=lambda g:json.dumps(g,sort_keys=True)
x={key(g) for g in acl_cloud['grants']};y={key(g) for g in acl_local['grants']}
report['grants']={'solo_produccion':sorted(x-y),'solo_local':sorted(y-x)}
report['ok']=all(not values for section in report.values() for values in section.values())
(r/'comparacion-final.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(0 if report['ok'] else 1)
