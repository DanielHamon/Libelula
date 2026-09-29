const DEFAULT_PATHS = {
  dashboard: '/admin',
  escuelas: '/admin/escuelas',
  libros: '/admin/libros',
  tokens: '/admin/tokens',
  usuarios: '/admin/usuarios',
  aprobaciones: '/admin/aprobaciones',
  logs: '/admin/logs',
}

const lastPaths = new Map(Object.entries(DEFAULT_PATHS))
const sectionLocations = new Map()
const visitedSections = new Set()

export function getAdminSection(pathname) {
  if (pathname.startsWith('/admin/escuelas')) return 'escuelas'
  if (pathname.startsWith('/admin/libros')) return 'libros'
  if (pathname.startsWith('/admin/tokens')) return 'tokens'
  if (pathname.startsWith('/admin/usuarios')) return 'usuarios'
  if (pathname.startsWith('/admin/aprobaciones')) return 'aprobaciones'
  if (pathname.startsWith('/admin/logs')) return 'logs'
  return 'dashboard'
}

export function rememberAdminLocation({ pathname, search = '', hash = '' }) {
  const section = getAdminSection(pathname)
  lastPaths.set(section, `${pathname}${search}${hash}`)
  return section
}

export function recordAdminWorkspaceLocation(location) {
  const section = rememberAdminLocation(location)
  sectionLocations.set(section, location)
  visitedSections.add(section)
  return [...visitedSections]
}

export function getAdminWorkspaceLocation(section) {
  return sectionLocations.get(section)
}

export function getRememberedAdminPath(defaultPath) {
  const section = getAdminSection(defaultPath)
  return lastPaths.get(section) || defaultPath
}

export function resetAdminNavigationMemory() {
  lastPaths.clear()
  sectionLocations.clear()
  visitedSections.clear()
  Object.entries(DEFAULT_PATHS).forEach(([section, path]) => lastPaths.set(section, path))
}
