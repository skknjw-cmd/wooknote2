// data.jsx — shared mock data for both variants

const NOTES_PINNED = [
  {
    id: 'live',
    title: '팀 미팅 — 생산 라인 점검',
    time: '오후 3:39',
    duration: '00:35:07',
    snippet: '화자 2: 예상으로는 2~3일 정도 소요될 것 같고요…',
    live: true,
    active: true,
  },
];

const NOTES_TODAY = [
  { id: 't1', title: 'Q2 예산 검토', time: '오전 10:15', duration: '22:14', snippet: '운영비 30% 절감안 — 인쿼리 비용 재산정', participants: 3 },
  { id: 't2', title: '신입 온보딩 1on1', time: '오전 9:00', duration: '12:48', snippet: '학습 로드맵, 멘토 매칭 확정', participants: 2 },
];

const NOTES_YESTERDAY = [
  { id: 'y1', title: '신제품 기획 브레인스토밍', time: '오후 2:00', duration: '48:02', snippet: '컨셉 4안 도출, A안 우선 검증', participants: 5 },
  { id: 'y2', title: '고객사 미팅 리뷰', time: '오전 11:30', duration: '18:35', snippet: '재계약 의향 확인 — 다음 단계 제안서', participants: 4 },
];

const NOTES_OLDER = [
  { id: 'o1', title: '주간 팀 회의', time: '04/28', duration: '31:08', snippet: '스프린트 회고, 다음 마일스톤 정의', participants: 6 },
  { id: 'o2', title: '디자인 시스템 워크샵', time: '04/24', duration: '01:22:40', snippet: '컬러 토큰 v2 승인, 컴포넌트 우선순위', participants: 4 },
  { id: 'o3', title: '엔지니어링 싱크', time: '04/22', duration: '45:12', snippet: '오프라인 STT 마이그레이션 계획', participants: 5 },
];

// Live transcript turns (the "현재 진행중인 회의")
const TURNS = [
  { id: 1, sp: 1, name: '화자 1', t: '00:05', text: '아이고 괜히 뭐 그것 때문에 온 건 아니고요. 그건 그냥 짧게 — 걔는 어떻게 보고드렸냐면, 궁금한 게 있어요. 대표님, 그거 중에 60 몇 명이라고 하더라고요. 그걸로 나간 고객들이 — 그거는 맞는 거에요?' },
  { id: 2, sp: 2, name: '화자 2', t: '00:27', text: '정확한 수치가 안 나와요. 왜 그러냐면 지금 저희도 중국 공장하고 통화를 하고 있는데, 애네들이 기계가 5대가 돌고 있는데 그 옆에서 보조해 주는 팀이 한 사람씩 더 있더라고요. 그 사람들이 용접을 하면서 어떤 사람이 빠뜨리고 어떤 사람이 안 빠뜨렸는지 모르니까 수치 계산이 안 되는 거에요.' },
  { id: 3, sp: 1, name: '화자 1', t: '00:48', text: '근데 기존에는 없었는데 이번에 있었던 거잖아요. 이번 것만 그렇다라고 추정해야 되니까, 이번 것만 그렇다고 가정했을 때, 언제부터 나간 거예요? 우리 애들은 13일부터 나간 거 같다는데.' },
  { id: 4, sp: 2, name: '화자 2', t: '01:03', text: '중점적으로 마지막 파트 썼던 게 거의 3월 13일 그 무렵부터 — 지금 현재 쓰고 있는, 문제가 생겼던 그 시기에 그거를 썼거든요.' },
  { id: 5, sp: 1, name: '화자 1', t: '01:16', text: '3월 13일.', short: true },
  { id: 6, sp: 2, name: '화자 2', t: '01:17', text: '네, 맞습니다. 그때부터 문제가 발생한 거고, 현재 공장 측에서는 대응 방안을 논의 중이에요. 가장 빠른 조치는 해당 라인을 일시 중단하고 전수 검사를 진행하는 건데, 이 경우 생산량에 영향이 불가피합니다.' },
  { id: 7, sp: 3, name: '화자 3', t: '01:42', text: '전수 검사를 하면 얼마나 지연이 생기는 거예요? 납기일이 이미 정해져 있는 오더가 있는데, 그거를 맞출 수 있는 건지가 걱정입니다.' },
  // typing
  { id: 8, sp: 2, name: '화자 2', t: '01:58', text: '예상으로는 2~3일 정도 소요될 것 같고요, 납기일 기준으로 보면', typing: true },
];

const KEYWORDS = [
  { w: '3월 13일', n: 4, on: true },
  { w: '전수 검사', n: 3 },
  { w: '용접 불량', n: 3 },
  { w: '중국 공장', n: 2 },
  { w: '납기일', n: 2 },
  { w: '생산 라인', n: 2 },
  { w: '대응 방안', n: 1 },
  { w: '라인 중단', n: 1 },
];

const SUMMARY_BULLETS = [
  '중국 공장 생산 라인의 용접 불량 문제가 **3월 13일경** 발생한 것으로 확인.',
  '해당 시점 이후 출하 물량의 품질 이슈 가능성 — 13일 이전 출하분 별도 추적 필요.',
  '전수 검사 시 **2~3일 생산 지연** 예상, 납기 영향 검토 중.',
];

const ACTIONS = [
  { who: '박팀장', what: '13일 이전 출하 물량 리스트 정리', when: '내일까지' },
  { who: '김매니저', what: '중국 공장과 전수 검사 일정 협의', when: '오늘 오후' },
  { who: '디자인팀', what: '검사 지연 대응 — 납기 변경 안내문 초안', when: '금요일' },
];

const SPEAKERS = [
  { id: 1, label: '화자 1', name: '', confidence: 0.94, turns: 3 },
  { id: 2, label: '화자 2', name: '', confidence: 0.92, turns: 3 },
  { id: 3, label: '화자 3', name: '', confidence: 0.81, turns: 1 },
];

// Linked memos — anchored to specific turns
const MEMOS = [
  { id: 'm1', anchor: '01:03', text: '13일 이전 출하분 재확인 필요. 담당: 박팀장.', author: '나', when: '방금' },
  { id: 'm2', anchor: '01:42', text: '납기일 영향 — 영업팀에 사전 공유.', author: '나', when: '1분 전' },
];

// Icons (24x24 stroke=1.6 lucide-style)
function Icon({ name, size = 16 }) {
  const paths = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
    sparkle: <><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9L19 14z"/></>,
    copy: <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
    edit: <><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></>,
    list: <><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></>,
    chevron: <polyline points="9 18 15 12 9 6"/>,
    chevdown: <polyline points="6 9 12 15 18 9"/>,
    folder: <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>,
    check: <polyline points="20 6 9 17 4 12"/>,
    pin: <><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1V4H8v2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24z"/></>,
    sticky: <><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11l5-5V5a2 2 0 0 0-2-2z"/><polyline points="16 3 16 8 21 8"/></>,
    user: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
    tag: <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></>,
    clock: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>,
    rewind: <><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></>,
    forward: <><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></>,
    pause: <><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></>,
    chev_l: <polyline points="15 18 9 12 15 6"/>,
    chev_r: <polyline points="9 18 15 12 9 6"/>,
    sidebar: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></>,
    panel: <><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></>,
    more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
    flag: <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>,
    bookmark: <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>,
    wand: <><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8L19 13"/><path d="M15 9h0"/><path d="M17.8 6.2L19 5"/><path d="M3 21l9-9"/><path d="M12.2 6.2L11 5"/></>,
    headphones: <><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></>,
    info: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// Render text with keyword highlights
function highlightText(text, terms) {
  if (!terms || !terms.length) return text;
  const re = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  const parts = text.split(re);
  return parts.map((p, i) => terms.includes(p) ? <mark key={i} className="kw">{p}</mark> : p);
}

// Render summary text with **bold** markers
function renderRich(text) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) {
      return <strong key={i} style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
    }
    return p;
  });
}

Object.assign(window, {
  NOTES_PINNED, NOTES_TODAY, NOTES_YESTERDAY, NOTES_OLDER,
  TURNS, KEYWORDS, SUMMARY_BULLETS, ACTIONS, SPEAKERS, MEMOS,
  Icon, highlightText, renderRich,
});
