import {test} from 'node:test'
import assert from 'node:assert/strict'
import {registrarError} from '../../../src/lib/diagnostics.js'
import {readFileSync,readdirSync} from 'node:fs'
import {parse} from '@babel/parser'
test('no expone mensajes, tokens, rutas, detalles ni códigos arbitrarios',()=>{
 const output=[],original=console.error
 console.error=(...args)=>output.push(args)
 try {
  registrarError('prueba', {code:'secreto',message:'alumno@example.test token=secreto',details:{respuesta:'privada'},hint:'ruta.pdf',status:403})
  assert.deepEqual(output,[['[Libelula] prueba',{code:'no_clasificado',status:403}]])
 } finally { console.error=original }
})
test('conserva únicamente código conocido y nivel warn',()=>{
 const output=[],original=console.warn;console.warn=(...args)=>output.push(args)
 try{registrarError('prueba',{code:'42501',status:900},'warn');assert.deepEqual(output,[['[Libelula] prueba',{code:'42501'}]])}finally{console.warn=original}
})
test('tolera errores vacíos y cadenas sin volcarlas',()=>{
 const output=[],original=console.error;console.error=(...args)=>output.push(args)
 try{for(const e of [null,undefined,'secreto'])registrarError('prueba',e);assert.ok(output.every(x=>x[1].code==='no_clasificado'))}finally{console.error=original}
})
test('todas las llamadas de aplicación usan etiquetas estáticas y el logger central',()=>{
 function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(`${dir}/${e.name}`):/\.(jsx?|tsx?)$/.test(e.name)?[`${dir}/${e.name}`]:[])}
 let calls=0
 for(const file of files('src')){
  const ast=parse(readFileSync(file,'utf8'),{sourceType:'module',plugins:['jsx']})
  function visit(node){
   if(!node||typeof node!=='object')return
   if(node.type==='CallExpression'){
    if(node.callee?.object?.name==='console')assert.equal(file,'src/lib/diagnostics.js',`${file}: console fuera del logger`)
    if(node.callee?.name==='registrarError'){
     calls++;assert.equal(node.arguments[0]?.type,'StringLiteral',`${file}: etiqueta no estática`)
     assert.ok(!node.arguments[2]||['error','warn'].includes(node.arguments[2].value),`${file}: nivel no permitido`)
    }
   }
   for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value)
  }
  visit(ast)
 }
 assert.equal(calls,44,'Revisar cobertura si cambian los puntos de diagnóstico')
})
