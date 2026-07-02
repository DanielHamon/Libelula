export const C = {
  primary: '#2563EB',
  primaryLight: '#DBEAFE',
  primaryDark: '#1D4ED8',
  success: '#16A34A',
  successLight: '#DCFCE7',
  accent: '#F97316',
  accentLight: '#FFF7ED',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  text: '#1F2937',
  textLight: '#6B7280',
  border: '#E5E7EB',
  danger: '#EF4444',
  dangerLight: '#FEE2E2',
  purple: '#7C3AED',
  purpleLight: '#EDE9FE',
}

export const S = {
  card: {
    background: '#FFFFFF',
    borderRadius: 14,
    border: '1px solid #E5E7EB',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  input: {
    padding: '10px 14px',
    borderRadius: 10,
    border: '1.5px solid #E5E7EB',
    fontSize: 14,
    fontFamily: 'Nunito, sans-serif',
    outline: 'none',
    background: '#FFFFFF',
    width: '100%',
    boxSizing: 'border-box',
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: '#1F2937',
    marginBottom: 6,
    display: 'block',
  },
  th: {
    padding: '10px 14px',
    textAlign: 'left',
    fontSize: 12,
    fontWeight: 700,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    borderBottom: '1px solid #E5E7EB',
    background: '#F8FAFC',
  },
  td: {
    padding: '12px 14px',
    fontSize: 14,
    color: '#1F2937',
    borderBottom: '1px solid #F3F4F6',
  },
}

export function btn(color = '#2563EB', size = 'md') {
  const pad = size === 'sm' ? '7px 14px' : '10px 20px'
  const fs = size === 'sm' ? 13 : 14
  return {
    background: color,
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: pad,
    fontSize: fs,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Nunito, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  }
}

export function btnOutline(color = '#2563EB', size = 'md') {
  const pad = size === 'sm' ? '6px 13px' : '9px 19px'
  const fs = size === 'sm' ? 13 : 14
  return {
    background: 'transparent',
    color,
    border: `1.5px solid ${color}`,
    borderRadius: 9,
    padding: pad,
    fontSize: fs,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'Nunito, sans-serif',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    whiteSpace: 'nowrap',
  }
}

export function badge(color, bg) {
  return {
    display: 'inline-block',
    background: bg || (color + '18'),
    color,
    fontSize: 11,
    fontWeight: 700,
    padding: '3px 9px',
    borderRadius: 20,
    whiteSpace: 'nowrap',
  }
}
