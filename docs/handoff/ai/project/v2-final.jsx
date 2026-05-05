// v2-final.jsx — V2 Granola형 final build

function Sidebar2({ collapsed, mode }) {
  if (collapsed) {
    return (
      <aside className="sidebar" style={{ width: 48, padding: '8px 0' }}>
        <button className="icon-btn" style={{ margin: '0 auto 8px' }}><Icon name="plus" /></button>
        <button className="icon-btn" style={{ margin: '0 auto 8px' }}><Icon name="search" /></button>
      </aside>
    );
  }
  return (
    <aside className="sidebar">
      <div className="sb-head">
        <button className="sb-newbtn">
          <Icon name="plus" size={14} /><span>새 녹음</span>
          <span className="kbd">⌘N</span>
        </button>
        <div className="sb-search">
          <Icon name="search" size={14} />
          <input type="text" placeholder="노트 · 화자 · 키워드" />
        </div>
      </div>
      <div className="sb-list">
        {mode !== 'review' && (
          <>
            <div className="sb-section"><Icon name="pin" size={11} /><span>진행 중</span></div>
            {NOTES_PINNED2.map(n => (
              <div key={n.id} className={'sb-item ' + (n.active ? 'active' : '')}>
                <div className="sb-item-row1">
                  {n.live && <span className="live-mini" />}
                  <span className="sb-item-title">{n.title}</span>
                </div>
                <div className="sb-item-meta">
                  <span style={{ color: 'var(--rec)', fontWeight: 600 }}>녹음 중 · {n.duration}</span>
                </div>
              </div>
            ))}
          </>
        )}
        <div className="sb-section"><span>오늘</span><span className="count">{NOTES_TODAY2.length + (mode === 'review' ? 1 : 0)}</span></div>
        {mode === 'review' && (
          <div className="sb-item active">
            <div className="sb-item-row1">
              <span className="sb-item-title">생산 라인 점검</span>
            </div>
            <div className="sb-item-meta"><span>오후 3:39</span><span className="dot" /><span>35:08</span></div>
            <div className="sb-item-snip">3월 13일 용접 불량 · 전수 검사 결정</div>
          </div>
        )}
        {NOTES_TODAY2.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1"><span className="sb-item-title">{n.title}</span></div>
            <div className="sb-item-meta"><span>{n.time}</span><span className="dot" /><span>{n.duration}</span></div>
          </div>
        ))}
        <div className="sb-section"><span>어제</span><span className="count">{NOTES_YESTERDAY2.length}</span></div>
        {NOTES_YESTERDAY2.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1"><span className="sb-item-title">{n.title}</span></div>
            <div className="sb-item-meta"><span>{n.time}</span><span className="dot" /><span>{n.duration}</span></div>
          </div>
        ))}
        <div className="sb-section"><span>이전</span><span className="count">{NOTES_OLDER2.length}</span></div>
        {NOTES_OLDER2.map(n => (
          <div key={n.id} className="sb-item">
            <div className="sb-item-row1"><span className="sb-item-title">{n.title}</span></div>
            <div className="sb-item-meta"><span>{n.time}</span><span className="dot" /><span>{n.duration}</span></div>
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

function nameOf(sp, names) {
  return names[sp] || `화자 ${sp}`;
}

function Transcript2({ kwOn, toggleKw, names, mode, onAnchor }) {
  const onKws = Array.from(kwOn);
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current && mode !== 'review') ref.current.scrollTop = ref.current.scrollHeight; }, [mode]);
  return (
    <section className="tr-pane">
      <div className="tr-head">
        <div className="h-title"><Icon name="headphones" size={13} /> 트랜스크립트</div>
        {mode !== 'review' && (
          <span className="live-pill" style={{ marginLeft: 'auto' }}><span className="dot" />LIVE 35:07</span>
        )}
        {mode === 'review' && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)' }}>총 35:08</span>
        )}
      </div>
      <div className="tr-kw">
        {KEYWORDS2.map(k => (
          <button key={k.w} className={'kw-chip ' + (kwOn.has(k.w) ? 'on' : '')} onClick={() => toggleKw(k.w)} style={{ flexShrink: 0 }}>
            {k.w}<span className="ct">{k.n}</span>
          </button>
        ))}
      </div>
      <div ref={ref} className="tr-body">
        {TURNS2.map(turn => (
          <div key={turn.id} className="turn">
            <div className="turn-head">
              <span className={'sp-name sp' + turn.sp} title="클릭해 이름 지정">{nameOf(turn.sp, names)}</span>
              <span className="turn-time" onClick={() => onAnchor && onAnchor(turn)}>{turn.t}</span>
              <div className="tr-actions" style={{ marginLeft: 'auto' }}>
                <button className="tr-action-btn" title="노트에 인용 삽입" onClick={() => onAnchor && onAnchor(turn)}>
                  <Icon name="bookmark" size={12} />
                </button>
                <button className="tr-action-btn" title="복사"><Icon name="copy" size={12} /></button>
              </div>
              {turn.typing && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--rec)', fontWeight: 600, marginLeft: 'auto' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--rec)', animation: 'pulse-rec 1.4s infinite' }} />받아쓰는 중
                </span>
              )}
            </div>
            <div className="turn-text" style={{ paddingLeft: 0 }}>
              {turn.typing ? <span className="typing">{highlightText(turn.text, onKws)}</span> : highlightText(turn.text, onKws)}
            </div>
          </div>
        ))}
      </div>
      {mode !== 'review' ? (
        <div className="tr-rec">
          <button className="rb" />
          <div className="timer">01:58</div>
          <div className="wf">
            {Array.from({ length: 32 }).map((_, i) => {
              const played = i < 4;
              const live = i >= 4 && i < 6;
              const h = 4 + Math.abs(Math.sin(i * 1.4)) * 14;
              return <div key={i} className={'b ' + (played ? 'played' : live ? 'live' : '')} style={{ height: h }} />;
            })}
          </div>
          <span className="speed-mini">1×</span>
        </div>
      ) : (
        <div className="tr-rec">
          <button className="rb" style={{ background: 'var(--ink)' }}>
            <span style={{ display: 'block', width: 0, height: 0, borderLeft: '7px solid #fff', borderTop: '5px solid transparent', borderBottom: '5px solid transparent', marginLeft: 2 }} />
          </button>
          <div className="timer">12:34</div>
          <div className="wf">
            {Array.from({ length: 32 }).map((_, i) => {
              const played = i < 12;
              const h = 4 + Math.abs(Math.sin(i * 1.4)) * 14;
              return <div key={i} className={'b ' + (played ? 'played' : '')} style={{ height: h }} />;
            })}
          </div>
          <span className="speed-mini">1×</span>
        </div>
      )}
    </section>
  );
}

function NoteDoc({ names, anchored, mode, summaryStale, regenSummary, regenerating }) {
  return (
    <section style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--surface)' }}>
      <div className="note-doc">
        <h1 contentEditable suppressContentEditableWarning>생산 라인 점검 — 5/5</h1>
        <div className="doc-meta">
          <span>2026.05.05 · 오후 3:39</span>
          <span style={{ color: 'var(--ink-5)' }}>·</span>
          <span>{PARTICIPANTS.length}명 참석</span>
          {mode !== 'review' ? (
            <>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span className="live"><span className="d" />녹음 중 35:07</span>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span>35분 8초</span>
              <span style={{ color: 'var(--ink-5)' }}>·</span>
              <span style={{ color: '#16a34a', fontWeight: 600 }}>✓ 종료됨</span>
            </>
          )}
        </div>

        {/* 1. AI 요약 */}
        <div className="nblock ai-block">
          <div className="nblock-h" style={{ marginBottom: 10 }}>
            <span className="badge-ai"><span style={{ width: 5, height: 5, borderRadius: '50%', background: 'linear-gradient(135deg,#818cf8,#c084fc)' }} />AI 정리</span>
            <span style={{ fontSize: 12, fontWeight: 600 }}>핵심 요약</span>
            <span className="meta">
              {mode === 'review' ? (
                <span style={{ color: 'var(--ink-4)' }}>회의 종료 직후 자동 갱신</span>
              ) : summaryStale ? (
                <span className="stale">새 발화 12개</span>
              ) : (
                <span style={{ color: 'var(--ink-4)' }}>방금 갱신</span>
              )}
              <button className="gen-btn" onClick={regenSummary} disabled={regenerating}>
                <Icon name="sparkle" size={11} />
                {regenerating ? '정리 중…' : '다시 정리'}
              </button>
            </span>
          </div>
          <ul>
            {SUMMARY_BULLETS2.map((b, i) => <li key={i}>{renderRich(b)}</li>)}
          </ul>
        </div>

        {/* 2. 맥락 / 배경 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><Icon name="folder" size={14} /></span>
            맥락 / 배경
          </div>
          <p>중국 공장 용접 라인의 불량 이슈가 보고됨. 정확한 발생 시점 파악이 어려운 이유는, 기계 5대를 보조 인력이 사람마다 다르게 운영하기 때문. 3월 13일 무렵부터 문제가 발생한 것으로 추정됨.</p>
          {anchored && (
            <div className="quote-block">
              <div className="qtxt">"{anchored.text.length > 80 ? anchored.text.slice(0, 80) + '…' : anchored.text}"</div>
              <div className="qmeta">
                <span className="name" style={{ color: `var(--sp${anchored.sp})` }}>{nameOf(anchored.sp, names)}</span>
                <span className="qt">↪ {anchored.t}</span>
              </div>
            </div>
          )}
        </div>

        {/* 3. 결정사항 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico" style={{ color: '#16a34a' }}><Icon name="check" size={14} /></span>
            결정사항
            <span className="meta"><button className="gen-btn"><Icon name="plus" size={11} />추가</button></span>
          </div>
          <ul className="d-list">
            {DECISIONS.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>

        {/* 4. 해야 할 일 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><Icon name="check" size={14} /></span>
            해야 할 일
            <span className="meta">
              <span style={{ color: 'var(--ink-4)' }}>{ACTIONS2.filter(a => !a.done).length}건 진행 중</span>
              <button className="gen-btn"><Icon name="plus" size={11} />추가</button>
            </span>
          </div>
          <div className="act-list">
            {ACTIONS2.map((a, i) => (
              <label key={i} className={'act-row' + (a.done ? ' done' : '')}>
                <input type="checkbox" defaultChecked={a.done} />
                <div className="body">
                  <div className="text">{a.what}</div>
                  <div className="row2">
                    <span className="who">@{a.who}</span>
                    <span className="when"><Icon name="clock" size={10} />{a.when}</span>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 5. 미해결 질문 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico" style={{ color: 'var(--warn)' }}><Icon name="flag" size={14} /></span>
            미해결 질문
            <span className="meta"><button className="gen-btn"><Icon name="plus" size={11} />추가</button></span>
          </div>
          <ul className="q-list">
            {QUESTIONS.map((q, i) => <li key={i}>{q}</li>)}
          </ul>
        </div>

        {/* 6. 참여자 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><Icon name="user" size={14} /></span>
            참여자
            <span className="meta" style={{ color: 'var(--ink-4)', fontSize: 11 }}>화자 자동 감지 · 클릭해 편집</span>
          </div>
          <div className="party">
            {PARTICIPANTS.map(p => (
              <div key={p.sp} className="chip">
                <span className={'av sp' + p.sp}>{p.initials}</span>
                <span>{p.name}</span>
                <span className="role">· {p.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 7. 다음 회의 안건 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><Icon name="clock" size={14} /></span>
            다음 회의 안건
          </div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {NEXT_AGENDA.map((a, i) => (
              <li key={i} style={{ fontSize: 13.5, lineHeight: 1.55, padding: '4px 6px', borderRadius: 6, color: 'var(--ink-2)' }}>
                <span style={{ display: 'inline-block', width: 4, height: 4, borderRadius: '50%', background: 'var(--ink-3)', verticalAlign: 'middle', marginRight: 8, marginBottom: 2 }} />
                {a}
              </li>
            ))}
          </ul>
        </div>

        {/* 8. 자유 메모 */}
        <div className="nblock">
          <div className="nblock-h">
            <span className="ico"><Icon name="edit" size={14} /></span>
            메모
          </div>
          <p contentEditable suppressContentEditableWarning style={{ outline: 'none', minHeight: 22 }}>
            13일 이전 출하분 → 박지민 팀장 컨택. 영업팀에 검사 일정 사전 공유 필요.
          </p>
        </div>

        <button className="add-block">
          <Icon name="plus" size={12} />
          <span>블록 추가 — / 입력</span>
        </button>
      </div>
    </section>
  );
}

function V2Final({ mode = 'live', showExport = false, onCloseExport }) {
  const [kwOn, setKwOn] = React.useState(new Set(KEYWORDS2.filter(k => k.on).map(k => k.w)));
  const [names, setNames] = React.useState({ 1: '김태현', 2: '이영석', 3: '박지민' });
  const [anchored, setAnchored] = React.useState({ sp: 4, t: '01:03', text: '중점적으로 마지막 파트 썼던 게 거의 3월 13일 그 무렵부터' });
  const [summaryStale, setSummaryStale] = React.useState(true);
  const [regenerating, setRegenerating] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const [exportFmt, setExportFmt] = React.useState('pdf');

  const toggleKw = (w) => setKwOn(prev => { const n = new Set(prev); n.has(w) ? n.delete(w) : n.add(w); return n; });
  const onAnchor = (turn) => setAnchored({ sp: turn.sp, t: turn.t, text: turn.text });
  const regenSummary = () => {
    setRegenerating(true);
    setTimeout(() => { setRegenerating(false); setSummaryStale(false); }, 1400);
  };

  return (
    <div className="app2" style={{ gridTemplateColumns: `${collapsed ? 48 : 240}px 1fr`, height: '100%', position: 'relative' }}>
      <Sidebar2 collapsed={collapsed} mode={mode} />
      <main style={{ display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--surface)' }}>
        <div className="topbar">
          <button className="icon-btn" onClick={() => setCollapsed(c => !c)}><Icon name="sidebar" size={15} /></button>
          <div className="crumb">
            <span>전체 노트</span><span className="crumb-sep">/</span><span>오늘</span>
          </div>
          <input className="title-input" defaultValue="생산 라인 점검 — 5/5" />
          <div className="actions">
            {mode !== 'review' && <span className="live-pill"><span className="dot" />REC 35:07</span>}
            {mode === 'review' && <button className="btn"><Icon name="sparkle" size={13} />다시 정리</button>}
            <button className="icon-btn"><Icon name="copy" /></button>
            <button className="icon-btn" title="내보내기"><Icon name="download" /></button>
            <button className="icon-btn"><Icon name="more" /></button>
          </div>
        </div>
        {mode === 'review' && (
          <div className="review-banner">
            <span className="ico"><Icon name="check" size={14} /></span>
            <span><b>녹음이 종료되었습니다.</b> AI 정리가 자동으로 갱신되었어요.</span>
            <div className="actions">
              <button className="btn" style={{ background: 'transparent', borderColor: '#fcd34d', color: '#78350f' }}>이어 녹음</button>
              <button className="btn btn-primary" style={{ background: '#78350f', borderColor: '#78350f' }}>저장</button>
            </div>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <Transcript2 kwOn={kwOn} toggleKw={toggleKw} names={names} mode={mode} onAnchor={onAnchor} />
          <NoteDoc names={names} anchored={anchored} mode={mode} summaryStale={summaryStale} regenSummary={regenSummary} regenerating={regenerating} />
        </div>
      </main>

      {showExport && (
        <div className="modal-bg" style={{ position: 'absolute' }}>
          <div className="export-modal">
            <h3>노트 내보내기</h3>
            <p className="sub">생산 라인 점검 — 5/5 · 35분 8초</p>
            <div className="fmt-grid">
              <div className={'fmt-card ' + (exportFmt === 'pdf' ? 'on' : '')} onClick={() => setExportFmt('pdf')}>
                <div className="fmt-h">PDF<span className="ext">.pdf</span></div>
                <div className="fmt-d">노트 + 트랜스크립트 + 화자 색상 보존</div>
              </div>
              <div className={'fmt-card ' + (exportFmt === 'md' ? 'on' : '')} onClick={() => setExportFmt('md')}>
                <div className="fmt-h">Markdown<span className="ext">.md</span></div>
                <div className="fmt-d">Notion · Obsidian 호환 · 일반 텍스트</div>
              </div>
              <div className={'fmt-card ' + (exportFmt === 'docx' ? 'on' : '')} onClick={() => setExportFmt('docx')}>
                <div className="fmt-h">Word<span className="ext">.docx</span></div>
                <div className="fmt-d">서식 유지, 액션 아이템 표 포함</div>
              </div>
              <div className={'fmt-card ' + (exportFmt === 'audio' ? 'on' : '')} onClick={() => setExportFmt('audio')}>
                <div className="fmt-h">원본 오디오<span className="ext">.webm</span></div>
                <div className="fmt-d">녹음 파일 그대로 저장</div>
              </div>
            </div>
            <div className="opt-row"><input type="checkbox" defaultChecked id="o1" /><label htmlFor="o1">트랜스크립트 포함</label></div>
            <div className="opt-row"><input type="checkbox" defaultChecked id="o2" /><label htmlFor="o2">AI 요약 포함</label></div>
            <div className="opt-row"><input type="checkbox" id="o3" /><label htmlFor="o3">타임스탬프 표시</label></div>
            <div className="actions">
              <button className="btn" onClick={onCloseExport}>취소</button>
              <button className="btn btn-primary"><Icon name="download" size={13} />내보내기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

window.V2Final = V2Final;
