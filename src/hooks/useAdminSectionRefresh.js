import { useEffect, useRef } from 'react'

export const ADMIN_SECTION_ACTIVATED_EVENT = 'iabooks:admin-section-activated'

export function useAdminSectionRefresh(section, refresh) {
  const refreshRef = useRef(refresh)

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    function handleActivation(event) {
      if (event.detail?.section === section) refreshRef.current()
    }

    window.addEventListener(ADMIN_SECTION_ACTIVATED_EVENT, handleActivation)
    return () => window.removeEventListener(ADMIN_SECTION_ACTIVATED_EVENT, handleActivation)
  }, [section])
}
