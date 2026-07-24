const MAX_RECENT_BOOKS = 3
export const RECENT_BOOKS_EVENT = 'libelula:recent-books-updated'

function storageKey(userId) {
  return `libelula_recent_books_${userId}`
}

export function getRecentBooks(userId) {
  if (!userId) return []
  try {
    const books = JSON.parse(localStorage.getItem(storageKey(userId)) || '[]')
    return Array.isArray(books) ? books.slice(0, MAX_RECENT_BOOKS) : []
  } catch {
    return []
  }
}

export function rememberRecentBook(userId, book) {
  if (!userId || !book?.id) return
  const recentBooks = [
    { id: book.id, titulo: book.titulo || 'Libro', emoji: book.emoji || '📘' },
    ...getRecentBooks(userId).filter(item => item.id !== book.id),
  ].slice(0, MAX_RECENT_BOOKS)

  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(recentBooks))
    window.dispatchEvent(new CustomEvent(RECENT_BOOKS_EVENT, { detail: { userId } }))
  } catch {
    // El historial reciente es una mejora visual; no debe impedir abrir el libro.
  }
}
