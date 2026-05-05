// speaker-flow.jsx — (b) pre-meeting roster + (c) live mapping prompt

function PreMeetingRoster() {
  const [roster, setRoster] = React.useState([
    { sp: 1, name: '김태현', role: '생산총괄', initials: '김' },
    { sp: 2, name: '이영석', role: '품질관리팀', initials: '이' },
    { sp: 3, name: '박지민', role: '영업팀장', initials: '박' },
  ]);
  const [calOpen, setCalOpen] = React.useState(true);

  return (
    <div className="roster-stage">
      <div className="roster-card">
        <h2>회의 참여자</h2>
        <p className="sub">
          참여자를 미리 등록하면 녹음이 시작될 때 화자를 자동으로 매칭해드려요.<br />
          나중에도 트랜스크립트에서 언제든 수정할 수 있습니다.
        </p>

        {calOpen && (
          <div className="cal-suggest">
            <span className="ico"><Icon name="clock" size={16} /></span>
            <div className="body">
              <b>생산 라인 점검 (오후 3:30 - 4:30)</b><br />
              <span style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>캘린더 참석자 3명을 가져올까요?</span>
            </div>
            <button onClick={() => setCalOpen(false)}>가져오기</button>
          </div>
        )}

        <div className="label">참여자 ({roster.length}명)</div>
        <div className="roster-list">
          {roster.map((p, i) => (
            <div key={i} className="roster-row">
              <span className={'av sp' + p.sp}>{p.initials}</span>
              <input className="name-input" defaultValue={p.name} placeholder="이름" />
              <input className="role-input" defaultValue={p.role} placeholder="역할 (선택)" />
              <button className="del-btn" onClick={() => setRoster(r => r.filter((_, j) => j !== i))} title="삭제">
                <Icon name="x" size={14} />
              </button>
            </div>
          ))}
          <div className="roster-row" style={{ opacity: 0.7 }}>
            <span className="av placeholder">?</span>
            <input className="name-input" placeholder="추가 화자는 녹음 중 자동 감지됩니다" disabled />
          </div>
        </div>
        <button className="add-row" onClick={() => {
          const sp = roster.length + 1;
          setRoster(r => [...r, { sp, name: '', role: '', initials: '?' }]);
        }}>
          <Icon name="plus" size={13} />
          참여자 직접 추가
        </button>

        <div className="tip">
          <span className="ico"><Icon name="info" size={13} /></span>
          <span>음성 임베딩으로 화자를 익명 분리하고, 등록된 이름과 매칭합니다. 등록되지 않은 화자가 말하면 새 화자로 인식되며 라이브 중 이름을 지정할 수 있어요.</span>
        </div>

        <div className="roster-foot">
          <button className="skip">건너뛰기</button>
          <button className="start">녹음 시작</button>
        </div>
      </div>
    </div>
  );
}

function LiveWithPrompt() {
  // Renders V2Final live, with an inline speaker-mapping prompt overlaid
  // pointing at the first utterance of an unrecognized speaker.
  const [open, setOpen] = React.useState(true);
  const candidates = [
    { sp: 1, name: '김태현', role: '생산총괄', initials: '김' },
    { sp: 2, name: '이영석', role: '품질관리팀', initials: '이' },
    { sp: 3, name: '박지민', role: '영업팀장', initials: '박' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <V2Final mode="live" />
      {open && (
        <div className="map-prompt" style={{ left: 296, top: 282 }}>
          <div className="mp-h">
            <span className="av" style={{ background: 'var(--sp4)' }}>?</span>
            <span>새 화자 감지됨 · <b>화자 4</b></span>
          </div>
          <div className="mp-q">이 분은 누구인가요?</div>
          <div className="mp-options">
            {candidates.map((p, i) => (
              <button key={i} className="mp-opt kbd-hint" onClick={() => setOpen(false)}>
                <span className={'av sp' + p.sp}>{p.initials}</span>
                <span>{p.name}</span>
                <span className="role">{p.role}</span>
                <span className="kbd">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="mp-foot">
            <button onClick={() => setOpen(false)}>나중에</button>
            <button className="new">+ 새 참여자로 추가</button>
          </div>
        </div>
      )}
    </div>
  );
}

window.PreMeetingRoster = PreMeetingRoster;
window.LiveWithPrompt = LiveWithPrompt;
