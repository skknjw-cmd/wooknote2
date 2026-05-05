// v2.jsx — V2: Granola형
// 좌: 사이드바 (V1과 동일 컴포넌트 재사용)
// 중-좌: 트랜스크립트 (좁게)
// 중-우: 노트 — 인라인 메모, 자유 작성 + 스마트 블록 (요약/액션이 흐름 안에 섞임)

function V2Notes({ kwOn }) {
  const onKws = Array.from(kwOn);
  return (
    <section style={{
      flex: 1, minWidth: 0, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 24px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="edit" size={14} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>노트</span>
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>자유롭게 작성하세요 · AI가 회의 흐름과 연결합니다</span>
        <button className="icon-btn" style={{ marginLeft: 'auto' }}><Icon name="more" size={14} /></button>
      </div>

      {/* Body — Granola-style note doc */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {/* Title */}
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>
          생산 라인 점검 — 5/5
        </h1>
        <div style={{ fontSize: 11.5, color: 'var(--ink-4)', marginBottom: 24, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Icon name="clock" size={11} />
          <span>오후 3:39 · 4명 참석</span>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span style={{ color: 'var(--rec)', fontWeight: 600 }}>녹음 중 35:07</span>
        </div>

        {/* AI block — auto summary */}
        <div style={{
          background: 'linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          padding: '14px 16px',
          marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600,
              color: 'var(--ink-2)', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'linear-gradient(135deg, #818cf8, #c084fc)' }} />
              AI 정리
            </span>
            <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>30초 전</span>
            <button className="icon-btn" style={{ marginLeft: 'auto', height: 22, width: 22 }}><Icon name="sparkle" size={11} /></button>
          </div>
          <ul className="summary-card-bullets">
            {SUMMARY_BULLETS.map((b, i) => <li key={i}>{renderRich(b)}</li>)}
          </ul>
        </div>

        {/* User-written heading */}
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 8 }}>맥락</h2>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--ink-2)', marginBottom: 14 }}>
          중국 공장 용접 라인의 불량 이슈가 갑자기 보고됨. 정확한 발생 시점 파악이 어려운 이유는,
          기계 5대를 보조 인력이 사람마다 다르게 운영하기 때문.
        </p>

        {/* Inline anchored memo — links to a turn */}
        <div style={{
          padding: '10px 12px',
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 'var(--r-md)',
          marginBottom: 16,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
        }}>
          <Icon name="bookmark" size={13} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--ink)' }}>
              13일 이전 출하분 → 박팀장 확인 부탁
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--info)', cursor: 'pointer' }}>↪ 01:03 화자 2</span>
              <span>·</span>
              <span>방금</span>
            </div>
          </div>
        </div>

        {/* Action block */}
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8, marginTop: 8 }}>해야 할 일</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 18 }}>
          {ACTIONS.map((a, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0' }}>
              <input type="checkbox" style={{ accentColor: 'var(--ink)', marginTop: 4 }} />
              <span style={{ fontSize: 13.5, lineHeight: 1.55, flex: 1 }}>
                {a.what}
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--info)', background: '#eff6ff', borderRadius: 4, padding: '0 6px' }}>@{a.who}</span>
                <span style={{ marginLeft: 6, fontSize: 11.5, color: 'var(--ink-4)' }}>{a.when}</span>
              </span>
            </label>
          ))}
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>미해결 질문</h2>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
          <li style={{ fontSize: 13.5, lineHeight: 1.55, paddingLeft: 16, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--ink-4)' }}>?</span>
            전수 검사 시 납기 영향이 있는 오더 목록 — 영업팀 확인 필요
          </li>
          <li style={{ fontSize: 13.5, lineHeight: 1.55, paddingLeft: 16, position: 'relative' }}>
            <span style={{ position: 'absolute', left: 0, color: 'var(--ink-4)' }}>?</span>
            13일 이전 출하분의 표본 검사로 충분한지, 전수가 필요한지
          </li>
        </ul>

        {/* Slash menu placeholder */}
        <div style={{
          padding: '8px 10px',
          color: 'var(--ink-4)',
          fontSize: 12.5,
          borderRadius: 'var(--r-sm)',
          cursor: 'text',
        }}>
          /를 입력해 블록 추가 · 메모, 체크리스트, 인용…
        </div>
      </div>
    </section>
  );
}

function V2Transcript({ kwOn, toggleKw }) {
  const onKws = Array.from(kwOn);
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, []);

  return (
    <section style={{
      width: 460,
      flexShrink: 0,
      display: 'flex', flexDirection: 'column',
      background: 'var(--surface-2)',
      overflow: 'hidden',
    }}>
      {/* Sub-header */}
      <div style={{
        padding: '10px 18px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        background: 'var(--surface-2)',
      }}>
        <Icon name="headphones" size={13} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>실시간 트랜스크립트</span>
        <span className="live-pill" style={{ marginLeft: 'auto' }}>
          <span className="dot" /> LIVE 35:07
        </span>
      </div>

      {/* Keyword chips — compact */}
      <div style={{ padding: '8px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, overflowX: 'auto', flexShrink: 0 }}>
        {KEYWORDS.slice(0, 6).map(k => (
          <button
            key={k.w}
            className={'kw-chip ' + (kwOn.has(k.w) ? 'on' : '')}
            onClick={() => toggleKw(k.w)}
            style={{ flexShrink: 0 }}
          >
            {k.w}<span className="ct">{k.n}</span>
          </button>
        ))}
        <button className="kw-chip" style={{ flexShrink: 0, color: 'var(--ink-3)' }}>＋</button>
      </div>

      {/* Turns */}
      <div ref={ref} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 16px' }}>
        {TURNS.map(turn => (
          <div key={turn.id} className="turn" style={{ padding: '10px 0' }}>
            <div className="turn-head">
              <span className={'turn-name sp' + turn.sp} style={{ fontSize: 11 }}>{turn.name}</span>
              <span className="turn-time">{turn.t}</span>
              <button
                className="icon-btn"
                style={{ marginLeft: 'auto', width: 22, height: 22, opacity: 0.5 }}
                title="이 시점에 노트 연결"
              >
                <Icon name="bookmark" size={12} />
              </button>
            </div>
            <div className="turn-text" style={{ fontSize: 13.5 }}>
              {turn.typing
                ? <span className="typing">{highlightText(turn.text, onKws)}</span>
                : highlightText(turn.text, onKws)}
            </div>
          </div>
        ))}
      </div>

      {/* Compact rec bar */}
      <div className="recbar" style={{ padding: '10px 16px', background: 'var(--surface)' }}>
        <button className="rec-btn recording" style={{ width: 32, height: 32 }} />
        <div className="timer" style={{ fontSize: 12, minWidth: 48 }}>01:58</div>
        <div className="waveform" style={{ height: 22 }}>
          {Array.from({ length: 36 }).map((_, i) => {
            const isPlayed = i < 4;
            const isLive = i >= 4 && i < 6;
            const h = 4 + Math.abs(Math.sin(i * 1.4)) * 14;
            return <div key={i} className={'bar ' + (isPlayed ? 'played' : isLive ? 'live' : '')} style={{ height: h }} />;
          })}
        </div>
        <button className="speed" style={{ fontSize: 10.5, padding: '3px 6px' }}>1×</button>
      </div>
    </section>
  );
}

function V2Main({ kwOn, toggleKw, sidebarCollapsed, toggleSidebar }) {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
      <div className="topbar">
        <button className="icon-btn" onClick={toggleSidebar}><Icon name="sidebar" size={15} /></button>
        <div className="crumb">
          <span>전체 노트</span>
          <span className="crumb-sep">/</span>
          <span>오늘</span>
        </div>
        <input className="title-input" defaultValue="생산 라인 점검 — 5/5" />
        <div className="actions">
          <button className="btn"><Icon name="sparkle" size={13} />다시 정리</button>
          <button className="icon-btn"><Icon name="copy" /></button>
          <button className="icon-btn"><Icon name="download" /></button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <V2Transcript kwOn={kwOn} toggleKw={toggleKw} />
        <V2Notes kwOn={kwOn} />
      </div>
    </main>
  );
}

function V2App() {
  const [kwOn, setKwOn] = React.useState(new Set(KEYWORDS.filter(k => k.on).map(k => k.w)));
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const toggleKw = (w) => setKwOn(prev => {
    const n = new Set(prev);
    n.has(w) ? n.delete(w) : n.add(w);
    return n;
  });
  const sbW = sidebarCollapsed ? 48 : 248;
  return (
    <div className="app" style={{ gridTemplateColumns: `${sbW}px 1fr`, height: '100%' }}>
      <V1Sidebar collapsed={sidebarCollapsed} />
      <V2Main kwOn={kwOn} toggleKw={toggleKw} sidebarCollapsed={sidebarCollapsed} toggleSidebar={() => setSidebarCollapsed(c => !c)} />
    </div>
  );
}

window.V2App = V2App;
