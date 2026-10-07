/**
 * pong 테마 설정
 * 노션에서 가져오지 않는 문구와 색은 여기에서 바꿉니다.
 */

/** 홈 이름 옆에 기울여 붙는 단어 (빈 문자열이면 이름만 표시) */
export const TITLE_SUFFIX = 'journal'

/** 홈 NOW 칸에서 한 글자씩 타이핑되는 문구 */
export const NOW_PHRASES = ['블로그 만드는 중', '새 글 쓰는 중', '요즘 빠져 있는 것']

/** 별을 누를 때마다 바뀌는 컬러 (첫 번째가 기본) */
export const PALETTES = [
  { id: 'mono', accent: '#111111', point: '#E4E4E0' },
  { id: 'cobalt', accent: '#1F5EFF', point: '#D9F57A' },
  { id: 'tomato', accent: '#F2462E', point: '#FFE36E' },
  { id: 'violet', accent: '#5B3DF5', point: '#B6F0D6' },
] as const

export type PaletteId = (typeof PALETTES)[number]['id']

/** 별 모양 (헤더, 푸터, 달력에서 같이 씀) */
export const STAR_POINTS =
  '50.0,0.0 61.0,30.9 93.3,25.0 72.0,50.0 93.3,75.0 61.0,69.1 50.0,100.0 39.0,69.1 6.7,75.0 28.0,50.0 6.7,25.0 39.0,30.9'

export const PALETTE_STORAGE_KEY = 'pong-palette'

/** 첫 화면이 그려지기 전에 저장된 컬러를 적용하는 스크립트 */
export const PALETTE_BOOT_SCRIPT = `try{var p=localStorage.getItem('${PALETTE_STORAGE_KEY}');if(p)document.documentElement.dataset.palette=p}catch(e){}`

/** 홈에서 ABOUT을 다시 누를 때 프로필 위치를 맞추라고 알리는 이벤트 */
export const ABOUT_EVENT = 'pong:about'
