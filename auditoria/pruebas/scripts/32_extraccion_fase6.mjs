// Contraste contractual de la extracción contra el respaldo anterior del bloque.
// Solo normaliza ubicación de nodos y llamadas diagnósticas de AUD-014.
import {readFileSync,readdirSync,writeFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {parse} from '@babel/parser'
const root=new URL('../resultados/fase6/',import.meta.url)
const before=readFileSync(new URL('cierre-local/src-antes/components/ActivityCard.jsx',root),'utf8')
const sources=['src/components/ActivityCard.jsx',...readdirSync('src/components/activities').map(f=>'src/components/activities/'+f)]
function declarations(source){
 const result=new Map()
 for(const entry of parse(source,{sourceType:'module',plugins:['jsx']}).program.body){
  const n=entry.declaration??entry
  if(n.type==='FunctionDeclaration')result.set(n.id.name,n)
  if(n.type==='VariableDeclaration')for(const d of n.declarations)if(d.id.type==='Identifier')result.set(d.id.name,d)
 }
 return result
}
function normalize(n){
 if(Array.isArray(n))return n.map(normalize)
 if(!n||typeof n!=='object')return n
 if(n.type==='CallExpression'&&(n.callee.name==='registrarError'||(n.callee.object?.name==='console'&&['warn','error'].includes(n.callee.property?.name))))return {type:'DiagnosticCall'}
 return Object.fromEntries(Object.entries(n).filter(([k])=>!['start','end','loc','extra','leadingComments','trailingComments','innerComments'].includes(k)).map(([k,v])=>[k,normalize(v)]))
}
const original=declarations(before),after=new Map(sources.flatMap(file=>[...declarations(readFileSync(file,'utf8'))]))
for(const [name,node] of original){assert.ok(after.has(name),name+' ausente');assert.deepEqual(normalize(after.get(name)),normalize(node),name+' cambió su contrato/lógica')}
const result={declaraciones_equivalentes:original.size,lineas_antes:before.split('\n').length,lineas_despues:readFileSync(sources[0],'utf8').split('\n').length,mecanicas:['TarjetasVolteables','SeleccionMultiple'],excepcion:'Solo sustitución de llamadas diagnósticas'}
writeFileSync(new URL('retoma-27/extraccion.json',root),JSON.stringify(result,null,2));console.log(JSON.stringify(result))
