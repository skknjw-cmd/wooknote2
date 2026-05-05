// v1.jsx — V1: 정돈형
// 좌: 사이드바 (그루핑 + 검색 + 핀)
// 중: 트랜스크립트 (요약 카드 → 키워드 → 화자 버블)
// 우: 메모 패널 (메모 + 화자 + 액션)

function V1Sidebar({ collapsed }) {
  if (collapsed) {
    return (
      <aside className="sidebar" style={{ width: 48, padding: '8px 0' }}>
        <button className="icon-btn" style={{ margin: '0 auto 8px' }}><Icon name="plus" /></button>
        <button className="icon-btn" style={{ margin: '0 auto 8px' }}><Icon name="search" /></button>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" style={{ margin: '0 auto' }}><Icon name="settings" /></button>
      </aside>
    );
  }
  return (
    <aside className="sidebar">
      <div className="sb-head">
        <button className="sb-newbtn">
          <Icon name="plus" size={14} />
          <span>새 녹음</span>
          <span className="kbd">⌘N</span>
        </button>
        <div className="sb-search">
          <Icon name="search" size={14} />
          <input type="text" placeholder="노트 · 화자 · 키워드 검색" />
        </div>
      </div>

      <div className="sb-list">
        <div className="sb-section">
          <Icon name="pin" size={11} />
          <span>진행 중</span>
        </div>
        {NOTES_PINNED.map(n => (
          <div key={n.id} className={'sb-item ' + (n.active ? 'active' : '')}>
            <div className="sb-item-row1">
              {n.live && <span className="live-mini" />}
              <span className="sb-item-title">{n.title}</span>
            </div>
            <div className="sb-item-meta">
              <span style={{ color: 'var(--rec)', fontWeight: 600 }}>녹음 중 · {n.duration}</span>
            </div>
            <div className="sb-item-snip">{n.snippet}</div>
          </div>
        ))}

        <div className="sb-section">
          <span>오늘</span>
          <span className="count">{NOTES_TODAY.length}</span>
        </div>
        {NOTES_TODAY.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1">
              <span className="sb-item-title">{n.title}</span>
            </div>
            <div className="sb-item-meta">
              <span>{n.time}</span>
              <span className="dot" />
              <span>{n.duration}</span>
              <span className="dot" />
              <span>{n.participants}명</span>
            </div>
          </div>
        ))}

        <div className="sb-section">
          <span>어제</span>
          <span className="count">{NOTES_YESTERDAY.length}</span>
        </div>
        {NOTES_YESTERDAY.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1">
              <span className="sb-item-title">{n.title}</span>
            </div>
            <div className="sb-item-meta">
              <span>{n.time}</span>
              <span className="dot" />
              <span>{n.duration}</span>
            </div>
          </div>
        ))}

        <div className="sb-section">
          <span>이전</span>
          <span className="count">{NOTES_OLDER.length}</span>
        </div>
        {NOTES_OLDER.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1">
              <span className="sb-item-title">{n.title}</span>
            </div>
            <div className="sb-item-meta">
              <span>{n.time}</span>
              <span className="dot" />
              <span>{n.duration}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-avatar">서</div>
        <div className="sb-foot-name">서영도</div>
        <button className="icon-btn"><Icon name="settings" size={14} /></button>
      </div>
    </aside>
  );
}

function V1Main({ activeTab, setActiveTab, kwOn, toggleKw, panelHidden, togglePanel, sidebarCollapsed, toggleSidebar }) {
  const onKws = KEYWORDS.filter(k => kwOn.has(k.w)).map(k => k.w);
  const transcriptRef = React.useRef(null);
  React.useEffect(() => {
    if (activeTab === 'transcript' && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [activeTab]);

  return (
    <main className="main-area" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
      {/* Top bar */}
      <div className="topbar">
        <button className="icon-btn" onClick={toggleSidebar} title="사이드바 토글">
          <Icon name="sidebar" size={15} />
        </button>
        <div className="crumb">
          <span>전체 노트</span>
          <span className="crumb-sep">/</span>
          <span>오늘</span>
        </div>
        <input className="title-input" defaultValue="팀 미팅 — 생산 라인 점검" />
        <div className="actions">
          <span className="live-pill"><span className="dot" />REC 35:07</span>
          <button className="icon-btn" title="복사"><Icon name="copy" /></button>
          <button className="icon-btn" title="내보내기"><Icon name="download" /></button>
          <button className="icon-btn" onClick={togglePanel} title="메모 패널 토글">
            <Icon name="panel" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <div className={'tab ' + (activeTab === 'transcript' ? 'active' : '')} onClick={() => setActiveTab('transcript')}>
          <Icon name="list" size={14} />
          음성 기록
          <span className="badge">{TURNS.length}</span>
        </div>
        <div className={'tab ' + (activeTab === 'summary' ? 'active' : '')} onClick={() => setActiveTab('summary')}>
          <Icon name="sparkle" size={14} />
          AI 요약
        </div>
        <div className={'tab ' + (activeTab === 'speakers' ? 'active' : '')} onClick={() => setActiveTab('speakers')}>
          <Icon name="user" size={14} />
          화자
          <span className="badge">{SPEAKERS.length}</span>
        </div>
        <div className="tab-rest">
          <button className="btn"><Icon name="edit" size={13} />편집</button>
          <button className="btn"><Icon name="copy" size={13} />복사</button>
        </div>
      </div>

      {/* Body */}
      <div ref={transcriptRef} style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 16px' }}>
        {activeTab === 'transcript' && (
          <>
            {/* AI summary card — collapsible */}
            <div className="summary-card">
              <div className="summary-card-head">
                <span className="ai-mark">AI 요약</span>
                <span className="meta">3개 핵심 · 30초 전 갱신</span>
                <button className="icon-btn" style={{ marginLeft: 'auto' }} title="갱신"><Icon name="sparkle" size={13} /></button>
              </div>
              <ul className="summary-card-bullets">
                {SUMMARY_BULLETS.map((b, i) => <li key={i}>{renderRich(b)}</li>)}
              </ul>
              <div className="summary-card-foot">
                <Icon name="clock" size={11} />
                녹음이 진행되며 실시간으로 갱신됩니다
              </div>
            </div>

            {/* Keyword filter */}
            <div className="kw-row" style={{ marginBottom: 18 }}>
              <span style={{ fontSize: 11, color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>키워드</span>
              {KEYWORDS.map(k => (
                <button
                  key={k.w}
                  className={'kw-chip ' + (kwOn.has(k.w) ? 'on' : '')}
                  onClick={() => toggleKw(k.w)}
                >
                  {k.w}<span className="ct">{k.n}</span>
                </button>
              ))}
            </div>

            {/* Speaker turns */}
            {TURNS.map(turn => (
              <div key={turn.id} className="turn">
                <div className="turn-head">
                  <span className={'turn-name sp' + turn.sp}>{turn.name}</span>
                  <span className="turn-time">{turn.t}</span>
                  {turn.typing && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: 'var(--rec)', fontWeight: 600, background: 'var(--rec-soft)', padding: '1px 6px', borderRadius: 999, border: '1px solid #fecaca' }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--rec)', animation: 'pulse-rec 1.4s ease-in-out infinite' }} />
                      받아쓰는 중
                    </span>
                  )}
                </div>
                <div className="turn-text">
                  {turn.typing ? <span className="typing">{highlightText(turn.text, onKws)}</span> : highlightText(turn.text, onKws)}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === 'summary' && (
          <div style={{ maxWidth: 720 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>AI 요약</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>녹음 종료 후 전체 요약이 생성됩니다. 현재는 진행 중 임시 요약입니다.</p>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>핵심 포인트</h3>
            <ul className="summary-card-bullets" style={{ marginBottom: 22 }}>
              {SUMMARY_BULLETS.map((b, i) => <li key={i} style={{ fontSize: 14 }}>{renderRich(b)}</li>)}
            </ul>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>액션 아이템</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ACTIONS.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  <input type="checkbox" style={{ accentColor: 'var(--ink)' }} />
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)' }}>{a.who}</span>
                  <span style={{ fontSize: 13, flex: 1 }}>{a.what}</span>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{a.when}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'speakers' && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 6 }}>화자</h2>
            <p style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 20 }}>이름을 지정하면 트랜스크립트 전체에 적용됩니다.</p>
            <div className="spk-map">
              {SPEAKERS.map(s => (
                <div key={s.id} className="spk-row" style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
                  <span className={'spk-dot sp' + s.id} />
                  <span className="num" style={{ minWidth: 60 }}>{s.label}</span>
                  <span className="arrow">→</span>
                  <input placeholder="이름 입력" />
                  <span className="pct" title="유사도">{Math.round(s.confidence * 100)}%</span>
                  <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{s.turns}회 발화</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recording bar */}
      <div className="recbar">
        <button className="rec-btn recording" title="중지" />
        <div className="timer">00:01:58<span className="total">/ 00:35:07</span></div>
        <div className="waveform">
          {Array.from({ length: 60 }).map((_, i) => {
            const isPlayed = i < 4;
            const isLive = i >= 4 && i < 6;
            const h = 6 + Math.abs(Math.sin(i * 1.3)) * 18 + (isLive ? 4 : 0);
            return <div key={i} className={'bar ' + (isPlayed ? 'played' : isLive ? 'live' : '')} style={{ height: h }} />;
          })}
        </div>
        <button className="icon-btn" title="-15초"><Icon name="rewind" /></button>
        <button className="speed">1.0×</button>
        <button className="icon-btn" title="+15초"><Icon name="forward" /></button>
      </div>
    </main>
  );
}

function V1Memo() {
  const [tab, setTab] = React.useState('memo');
  return (
    <aside className="rpanel">
      <div className="rpanel-head">
        <div className="rpanel-tabs">
          <button className={'rpanel-tab ' + (tab === 'memo' ? 'active' : '')} onClick={() => setTab('memo')}>메모</button>
          <button className={'rpanel-tab ' + (tab === 'actions' ? 'active' : '')} onClick={() => setTab('actions')}>액션</button>
          <button className={'rpanel-tab ' + (tab === 'speakers' ? 'active' : '')} onClick={() => setTab('speakers')}>화자</button>
        </div>
        <button className="icon-btn" style={{ marginLeft: 'auto' }}><Icon name="more" size={14} /></button>
      </div>
      <div className="rpanel-body">
        {tab === 'memo' && (
          <>
            <button className="memo-add">
              <Icon name="plus" size={13} />
              <span>이 시점에 메모 추가 — <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink-3)' }}>01:58</span></span>
            </button>
            {MEMOS.map(m => (
              <div key={m.id} className="memo-card">
                <span className="memo-anchor"><Icon name="bookmark" size={10} />{m.anchor}</span>
                {m.text}
                <div className="memo-foot">{m.author} · {m.when}</div>
              </div>
            ))}
            <div className="rpanel-h" style={{ marginTop: 8 }}>
              <span>북마크</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-4)', padding: '8px 10px', border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-md)', textAlign: 'center' }}>
              ⌘B로 현재 시점 북마크
            </div>
          </>
        )}
        {tab === 'actions' && (
          <>
            <div className="rpanel-h">
              <span>액션 아이템</span>
              <button className="add-mini">+</button>
            </div>
            {ACTIONS.map((a, i) => (
              <div key={i} className="memo-card" style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <input type="checkbox" style={{ accentColor: 'var(--ink)', marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12.5, marginBottom: 4 }}>{a.what}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-4)', display: 'flex', gap: 6 }}>
                    <span>{a.who}</span>
                    <span>·</span>
                    <span>{a.when}</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
        {tab === 'speakers' && (
          <>
            <div className="rpanel-h">
              <span>감지된 화자</span>
              <span style={{ fontSize: 10.5, color: 'var(--ink-4)', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>{SPEAKERS.length}명</span>
            </div>
            <div className="spk-map">
              {SPEAKERS.map(s => (
                <div key={s.id} className="spk-row">
                  <span className={'spk-dot sp' + s.id} />
                  <span className="num">{s.label}</span>
                  <span className="arrow">→</span>
                  <input placeholder="이름 입력" />
                  <span className="pct">{Math.round(s.confidence * 100)}%</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-4)', lineHeight: 1.5, padding: '8px 4px' }}>
              유사도 75% 이상일 때 자동 그룹화됩니다. 잘못 분류된 발화는 길게 눌러 재할당하세요.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function V1App({ tweaks }) {
  const [activeTab, setActiveTab] = React.useState('transcript');
  const [kwOn, setKwOn] = React.useState(new Set(KEYWORDS.filter(k => k.on).map(k => k.w)));
  const [panelHidden, setPanelHidden] = React.useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const toggleKw = (w) => {
    setKwOn(prev => {
      const n = new Set(prev);
      n.has(w) ? n.delete(w) : n.add(w);
      return n;
    });
  };

  const sbW = sidebarCollapsed ? 48 : 248;
  const memoW = panelHidden ? 0 : 312;

  return (
    <div className="app" style={{ gridTemplateColumns: `${sbW}px 1fr ${memoW}px`, gridTemplateRows: '1fr', height: '100%' }}>
      <V1Sidebar collapsed={sidebarCollapsed} />
      <V1Main
        activeTab={activeTab} setActiveTab={setActiveTab}
        kwOn={kwOn} toggleKw={toggleKw}
        panelHidden={panelHidden} togglePanel={() => setPanelHidden(p => !p)}
        sidebarCollapsed={sidebarCollapsed} toggleSidebar={() => setSidebarCollapsed(c => !c)}
      />
      {!panelHidden && <V1Memo />}
    </div>
  );
}

window.V1App = V1App;
