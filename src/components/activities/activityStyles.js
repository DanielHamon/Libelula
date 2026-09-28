export const C = {
  pink: '#e91e8c', pinkMid: '#f48fb1', pinkLight: '#fce4ec',
  purple: '#7b1fa2', purpleLight: '#f3e5f5',
  green: '#4caf50', greenLight: '#e8f5e9',
  red: '#f44336', redLight: '#ffebee',
  blue: '#1e88e5', blueLight: '#e3f2fd',
  teal: '#00897b', tealLight: '#e0f2f1',
  orange: '#e65100', orangeLight: '#fff3e0',
  text: '#2d2d2d', textMuted: '#757575',
  bg: '#fff9fb', white: '#ffffff', border: '#f0e0ea',
}

export function btnP(bg) { return { padding: '10px 22px', background: bg, color: '#fff', border: 'none', borderRadius: 50, cursor: bg === C.border ? 'default' : 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14 } }

export const btnS = { padding: '10px 22px', background: '#fff', color: C.textMuted, border: `2px solid ${C.border}`, borderRadius: 50, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700, fontSize: 13 }

export function arrBtn(disabled, col) { return { width: 22, height: 22, borderRadius: 4, border: 'none', background: disabled ? '#e0e0e0' : col, color: disabled ? '#aaa' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: 0 } }
