// Continue until an empty page: the server may cap pages below our requested size.
export async function leerPaginas(crearConsulta) {
  const filas = []
  for (;;) {
    const { data, error } = await crearConsulta().range(filas.length, filas.length + 499)
    if (error) throw error
    if (!Array.isArray(data)) throw new Error('Respuesta de datos inválida')
    if (data.length === 0) return filas
    filas.push(...data)
  }
}

// Bound IN filters independently from result pagination.
export async function leerPorIds(ids, crearConsulta, paginar = true) {
  const filas = []
  const unicos = [...new Set(ids)]
  for (let inicio = 0; inicio < unicos.length; inicio += 25) {
    const lote = unicos.slice(inicio, inicio + 25)
    filas.push(...await (paginar
      ? leerPaginas(() => crearConsulta(lote))
      : crearConsulta(lote)))
  }
  return filas
}
