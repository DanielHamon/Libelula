const MAX_RECENT_CLASSES = 3
export const RECENT_CLASSES_EVENT = 'libelula:recent-classes-updated'

const storageKey = userId => `libelula_recent_classes_${userId}`

export function getRecentClasses(userId) {
  if (!userId) return []
  try {
    const classes = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]')
    return Array.isArray(classes) ? classes.slice(0, MAX_RECENT_CLASSES) : []
  } catch {
    return []
  }
}

export function rememberRecentClass(userId, clase) {
  if (!userId || !clase?.id) return
  const recent = [
    { id: clase.id, nombre: clase.nombre || 'Clase', emoji: clase.emoji || '🏫' },
    ...getRecentClasses(userId).filter(item => item.id !== clase.id),
  ].slice(0, MAX_RECENT_CLASSES)

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(recent))
    window.dispatchEvent(new CustomEvent(RECENT_CLASSES_EVENT, { detail: { userId } }))
  } catch {
    // El historial es complementario y nunca debe impedir abrir una clase.
  }
}
