// data2.jsx — extended mock data for V2 final

const NOTES_PINNED2 = [
  { id: 'live', title: '생산 라인 점검', time: '오후 3:39', duration: '00:35:07', snippet: '용접 불량 → 전수 검사 검토', live: true, active: true },
];
const NOTES_TODAY2 = [
  { id: 't1', title: 'Q2 예산 검토', time: '오전 10:15', duration: '22:14', snippet: '운영비 30% 절감안' },
  { id: 't2', title: '신입 온보딩 1on1', time: '오전 9:00', duration: '12:48', snippet: '학습 로드맵 확정' },
];
const NOTES_YESTERDAY2 = [
  { id: 'y1', title: '신제품 기획 브레인스토밍', time: '오후 2:00', duration: '48:02', snippet: '컨셉 4안 도출' },
  { id: 'y2', title: '고객사 미팅 리뷰', time: '오전 11:30', duration: '18:35', snippet: '재계약 의향 확인' },
];
const NOTES_OLDER2 = [
  { id: 'o1', title: '주간 팀 회의', time: '04/28', duration: '31:08', snippet: '스프린트 회고' },
  { id: 'o2', title: '디자인 시스템 워크샵', time: '04/24', duration: '01:22:40', snippet: '컬러 토큰 v2 승인' },
];

const PARTICIPANTS = [
  { sp: 1, name: '김태현', role: '생산총괄', initials: '김' },
  { sp: 2, name: '이영석', role: '품질관리팀', initials: '이' },
  { sp: 3, name: '박지민', role: '영업팀장', initials: '박' },
];

// Turns referencing named participants
const TURNS2 = [
  { id: 1, sp: 1, t: '00:05', text: '아이고 괜히 뭐 그것 때문에 온 건 아니고요. 그건 그냥 짧게 — 걔는 어떻게 보고드렸냐면, 궁금한 게 있어요. 대표님, 그거 중에 60 몇 명이라고 하더라고요.' },
  { id: 2, sp: 2, t: '00:27', text: '정확한 수치가 안 나와요. 지금 저희도 중국 공장하고 통화 중인데, 기계 5대가 돌고 있는데 옆에서 보조해 주는 팀이 한 사람씩 더 있더라고요. 그 사람들이 용접하면서 누가 빠뜨렸는지를 모르니까 수치 계산이 안 되는 거에요.' },
  { id: 3, sp: 1, t: '00:48', text: '근데 기존에는 없었는데 이번에 있었던 거잖아요. 이번 것만 그렇다고 가정했을 때, 언제부터 나간 거예요? 우리 애들은 13일부터 나간 거 같다는데.' },
  { id: 4, sp: 2, t: '01:03', text: '중점적으로 마지막 파트 썼던 게 거의 3월 13일 그 무렵부터 — 지금 현재 쓰고 있는, 문제가 생겼던 그 시기에 그거를 썼거든요.' },
  { id: 5, sp: 1, t: '01:16', text: '3월 13일.' },
  { id: 6, sp: 2, t: '01:17', text: '네, 맞습니다. 그때부터 문제가 발생한 거고, 현재 공장 측에서는 대응 방안을 논의 중이에요. 가장 빠른 조치는 해당 라인을 일시 중단하고 전수 검사를 진행하는 건데, 이 경우 생산량에 영향이 불가피합니다.' },
  { id: 7, sp: 3, t: '01:42', text: '전수 검사를 하면 얼마나 지연이 생기는 거예요? 납기일이 이미 정해져 있는 오더가 있는데, 그거를 맞출 수 있는 건지가 걱정입니다.' },
  { id: 8, sp: 2, t: '01:58', text: '예상으로는 2~3일 정도 소요될 것 같고요, 납기일 기준으로 보면', typing: true },
];

const KEYWORDS2 = [
  { w: '3월 13일', n: 4, on: true },
  { w: '전수 검사', n: 3 },
  { w: '용접 불량', n: 3 },
  { w: '중국 공장', n: 2 },
  { w: '납기일', n: 2 },
  { w: '생산 라인', n: 2 },
];

const SUMMARY_BULLETS2 = [
  '중국 공장 생산 라인의 용접 불량이 **3월 13일경** 발생한 것으로 확인.',
  '13일 이후 출하분의 품질 이슈 가능성 — 별도 추적 필요.',
  '전수 검사 시 **2~3일 생산 지연** 예상, 납기 영향 검토 중.',
];

const ACTIONS2 = [
  { who: '박지민', what: '13일 이전 출하 물량 리스트 정리', when: '내일까지', done: false },
  { who: '이영석', what: '중국 공장과 전수 검사 일정 협의', when: '오늘 오후', done: true },
  { who: '디자인팀', what: '검사 지연 대응 — 납기 변경 안내문 초안', when: '금요일', done: false },
];

const DECISIONS = [
  '13일 이후 출하분에 한정해 전수 검사 진행 — 13일 이전 물량은 표본 검사로',
  '검사 지연으로 인한 납기 영향은 영업팀이 24시간 내 고객 안내',
];

const QUESTIONS = [
  '13일 이전 출하분의 표본 비율은? (5% vs 10%)',
  '전수 검사 인력 추가 투입 시 비용 처리는 어디서?',
];

const NEXT_AGENDA = [
  '5/8 — 검사 결과 1차 보고',
  '5/12 — 재발 방지 프로세스 확정',
];

Object.assign(window, {
  NOTES_PINNED2, NOTES_TODAY2, NOTES_YESTERDAY2, NOTES_OLDER2,
  PARTICIPANTS, TURNS2, KEYWORDS2, SUMMARY_BULLETS2,
  ACTIONS2, DECISIONS, QUESTIONS, NEXT_AGENDA,
});
