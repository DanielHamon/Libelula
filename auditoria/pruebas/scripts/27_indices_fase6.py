"""Genera SQL exclusivamente para Docker local. No ejecuta ni conecta a producción.
Fixtures conservados + tabla temporal sintética; todas las modificaciones se revierten.
"""
import json
from pathlib import Path
r=Path(__file__).resolve().parent.parent/'resultados'
u=json.loads((r/'usuarios.json').read_text())
d=json.loads((r/'datos.json').read_text())
def literal(value): return "'"+str(value).replace("'","''")+"'"
users=','.join(literal(x) for x in [u['estudiante_a1']['id'],u['estudiante_a2']['id'],*d['estudiantes_carga']][:25])
acts=','.join(literal(x) for x in d['actividades'][:25])
queries={
 'panel_docente':f"SELECT usuario_id, actividad_id, respuesta, es_correcta FROM public.respuestas WHERE usuario_id IN ({users}) AND actividad_id IN ({acts}) ORDER BY usuario_id, actividad_id LIMIT 500",
 'fk_actividad':f"SELECT id FROM public.respuestas WHERE actividad_id={literal(d['actividades'][0])}",
 'fk_unidad':f"SELECT id FROM public.respuestas WHERE unidad_id={literal(d['unidades'][0])}",
 'fk_libro':f"SELECT id FROM public.respuestas WHERE libro_id={literal(d['libro'])}",
}
sql="""\\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE TEMP TABLE mediciones (escenario text, etapa text, caso text, repeticion int, plan jsonb);
GRANT ALL ON mediciones TO authenticated;
CREATE FUNCTION pg_temp.medir(escenario text, etapa text, caso text, consulta text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE p jsonb;
BEGIN
 FOR repeticion IN 0..6 LOOP
  EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || consulta INTO p;
  INSERT INTO mediciones VALUES (escenario,etapa,caso,repeticion,p);
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.medir(text,text,text,text) TO authenticated;
ANALYZE public.respuestas;
"""
for stage in ['antes','despues']:
 if stage=='despues':
  sql+='CREATE INDEX aud007_respuestas_actividad_unidad_idx ON public.respuestas (actividad_id, unidad_id);\nCREATE INDEX aud007_respuestas_unidad_libro_idx ON public.respuestas (unidad_id, libro_id);\nCREATE INDEX aud007_respuestas_libro_idx ON public.respuestas (libro_id);\n'
 for name,query in queries.items():
  if name=='panel_docente':
   sql+="SET LOCAL ROLE authenticated;\nSELECT set_config('request.jwt.claims',"+literal(json.dumps({'sub':u['docente_a']['id'],'role':'authenticated'}))+",true);\n"
  sql+=f"SELECT pg_temp.medir('fixtures_1500',{literal(stage)},{literal(name)},{literal(query)});\n"
  if name=='panel_docente': sql+='RESET ROLE;\n'
sql+='''CREATE TEMP TABLE respuestas_sinteticas (LIKE public.respuestas INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
CREATE UNIQUE INDEX sinteticas_pkey ON respuestas_sinteticas(id);
CREATE UNIQUE INDEX sinteticas_usuario_actividad_key ON respuestas_sinteticas(usuario_id,actividad_id);
INSERT INTO respuestas_sinteticas(id,usuario_id,actividad_id,unidad_id,libro_id,respuesta,es_correcta)
SELECT gen_random_uuid(),gen_random_uuid(),'a'||(g%6000),'u'||(g%1000),'l'||(g%100),'{"texto":"respuesta ficticia para medir índices"}'::jsonb,true
FROM generate_series(1,150000) g;
ANALYZE respuestas_sinteticas;
'''
for stage in ['antes','despues']:
 if stage=='despues':
  sql+='CREATE INDEX sinteticas_actividad_unidad_idx ON respuestas_sinteticas(actividad_id,unidad_id);\nCREATE INDEX sinteticas_unidad_libro_idx ON respuestas_sinteticas(unidad_id,libro_id);\nCREATE INDEX sinteticas_libro_idx ON respuestas_sinteticas(libro_id);\n'
 for name,where in [('fk_actividad',"actividad_id='a42'"),('fk_unidad',"unidad_id='u42'"),('fk_libro',"libro_id='l42'"),('fk_actividad_unidad',"actividad_id='a42' AND unidad_id='u42'"),('fk_unidad_libro',"unidad_id='u42' AND libro_id='l42'")]:
  query='SELECT id FROM respuestas_sinteticas WHERE '+where
  sql+=f"SELECT pg_temp.medir('sintetico_150000',{literal(stage)},{literal(name)},{literal(query)});\n"
sql+='''SELECT jsonb_build_object('mediciones',(SELECT jsonb_agg(to_jsonb(m)) FROM mediciones m),'indices_sinteticos',(SELECT jsonb_agg(jsonb_build_object('indice',indexrelname,'bytes',pg_relation_size(indexrelid))) FROM pg_stat_all_indexes WHERE relname='respuestas_sinteticas'),'indices_fixtures',(SELECT jsonb_agg(jsonb_build_object('indice',indexrelname,'bytes',pg_relation_size(indexrelid))) FROM pg_stat_all_indexes WHERE schemaname='public' AND relname='respuestas'));
ROLLBACK;
SELECT jsonb_build_object('respuestas_preservadas',(SELECT count(*) FROM public.respuestas),'indices_experimentales_restantes',(SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'aud007_%'));
'''
out=r/'fase6/aud007';out.mkdir(parents=True,exist_ok=True)
(out/'medicion.sql').write_text(sql)
print('SQL generado: fixtures preservados, tabla temporal sintética, ROLLBACK final obligatorio.')
