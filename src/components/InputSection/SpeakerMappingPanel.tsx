import React, { useMemo, useState, useRef, useEffect } from "react";
import styles from "./SpeakerMappingPanel.module.css";
import type { Segment, SpeakerMapping } from "@/types/meeting";
import { getSpeakerStats, parseAttendees } from "@/lib/speakerMapping";
import { proposeExcessMerge, type MergeProposal } from "@/lib/speakerMerge";

const ONBOARDING_KEY = "wooks_onboarding_speaker";

type SpeakerRow = {
  globalIndex: number;
  originalSpeakers: string[];
  count: number;
  currentName: string;
  absorbedRawKeys: string[]; // rawClovaKey values absorbed via auto-merge
};

interface Props {
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  defaultCollapsed?: boolean;
  disabled?: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  onChange: (mapping: SpeakerMapping) => void;
  onAttendeeAdd?: (name: string) => void;
  onApplyExcessMerge: (proposals: MergeProposal[]) => void;
  onGlobalUndo: () => void;
}

export default function SpeakerMappingPanel({
  segments,
  mapping,
  attendeesCsv,
  defaultCollapsed = true,
  disabled = false,
  isRecording,
  isTranscribing,
  onChange,
  onAttendeeAdd,
  onApplyExcessMerge,
  onGlobalUndo,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(ONBOARDING_KEY) === "done";
    setOnboardingDismissed(done);
  }, []);

  const dismissOnboarding = () => {
    localStorage.setItem(ONBOARDING_KEY, "done");
    setOnboardingDismissed(true);
  };

  const [suggestionState, setSuggestionState] = useState<
    "visible" | "dismissed" | "applied"
  >("visible");

  // Reset when a new recording starts (segments cleared)
  useEffect(() => {
    if (segments.length === 0) setSuggestionState("visible");
  }, [segments.length]);

  const attendeeOptions = useMemo(
    () => parseAttendees(attendeesCsv),
    [attendeesCsv]
  );

  const rows: SpeakerRow[] = useMemo(() => {
    const stats = getSpeakerStats(segments);

    // Per-originalSpeaker absorbed raw keys (rawClovaKey differing from originalSpeaker)
    const absorbedByKey = new Map<string, Set<string>>();
    for (const s of segments) {
      if (s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker) {
        const set = absorbedByKey.get(s.originalSpeaker) ?? new Set<string>();
        set.add(s.rawClovaKey);
        absorbedByKey.set(s.originalSpeaker, set);
      }
    }

    const merged: SpeakerRow[] = [];
    for (const s of stats) {
      const name = (mapping[s.originalSpeaker] || "").trim();
      const absorbed = Array.from(absorbedByKey.get(s.originalSpeaker) ?? []);
      if (name) {
        const existing = merged.find(
          (m) => m.currentName === name && m.currentName !== ""
        );
        if (existing) {
          existing.originalSpeakers.push(s.originalSpeaker);
          existing.count += s.count;
          existing.globalIndex = Math.min(existing.globalIndex, s.globalIndex);
          for (const k of absorbed) {
            if (!existing.absorbedRawKeys.includes(k))
              existing.absorbedRawKeys.push(k);
          }
          continue;
        }
      }
      merged.push({
        globalIndex: s.globalIndex,
        originalSpeakers: [s.originalSpeaker],
        count: s.count,
        currentName: name,
        absorbedRawKeys: absorbed,
      });
    }
    merged.sort((a, b) => a.globalIndex - b.globalIndex);
    return merged;
  }, [segments, mapping]);

  const speakerCount = rows.length;

  const hasAutoMerged = useMemo(
    () =>
      segments.some(
        (s) => s.rawClovaKey && s.rawClovaKey !== s.originalSpeaker
      ),
    [segments]
  );

  const canShowUndo =
    hasAutoMerged && !isRecording && !isTranscribing && !disabled;

  const attendeeCount = useMemo(
    () => parseAttendees(attendeesCsv).length,
    [attendeesCsv]
  );

  const proposals = useMemo(
    () => proposeExcessMerge(segments, attendeeCount),
    [segments, attendeeCount]
  );

  const showSuggestCard =
    suggestionState === "visible" &&
    !isRecording &&
    !isTranscribing &&
    !disabled &&
    proposals.length > 0;

  // Map originalSpeaker key -> "화자 N" label via getSpeakerStats globalIndex
  const labelByKey = useMemo(() => {
    const stats = getSpeakerStats(segments);
    const map = new Map<string, string>();
    for (const s of stats) {
      map.set(s.originalSpeaker, `화자 ${s.globalIndex}`);
    }
    return map;
  }, [segments]);

  // Per-key utterance count (across all chunks — used for "발화 N회" display)
  const countByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of segments) {
      m.set(s.originalSpeaker, (m.get(s.originalSpeaker) ?? 0) + 1);
    }
    return m;
  }, [segments]);

  if (segments.length === 0) return null;

  return (
    <section className={styles.container} aria-label="화자 이름 지정">
      <div
        className={styles.header}
        onClick={() => !disabled && setCollapsed((c) => !c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
      >
        <h3 className={styles.headerTitle}>
          화자 이름 지정
          <span className={styles.badge}>{speakerCount}명 감지됨</span>
        </h3>
        {canShowUndo && (
          <button
            type="button"
            className={styles.undoButton}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("모든 자동 병합을 취소하시겠습니까?")) {
                onGlobalUndo();
                setSuggestionState("dismissed");
              }
            }}
            aria-label="자동 병합 전체 취소"
          >
            자동 병합 전체 취소
          </button>
        )}
        <span className={styles.chevron}>{collapsed ? "▾" : "▴"}</span>
      </div>

      {!collapsed && (
        <div className={styles.body}>
          {!onboardingDismissed && (
            <div className={styles.banner} role="note">
              <span>
                💡 Clova가 자동으로 화자를 구분하지만 가끔 틀립니다. 아래에서
                실제 이름을 지정하세요. 같은 사람이 여러 번 나타나면 같은 이름을
                선택하면 자동으로 합쳐집니다.
              </span>
              <button
                className={styles.bannerDismiss}
                onClick={dismissOnboarding}
                aria-label="안내 닫기"
              >
                ×
              </button>
            </div>
          )}

          {showSuggestCard && (
            <div className={styles.suggestCard} role="note">
              <div>
                ⚠ 일부 청크에서 참석자 수({attendeeCount}명)를 초과하는 화자가 감지되었습니다.
                Clova가 동일 인물을 여러 화자로 쪼갠 경우일 수 있습니다.
              </div>
              <ul style={{ margin: "0.5rem 0 0.75rem 1.2rem", padding: 0 }}>
                {proposals.map((p) => {
                  const fromLabel = labelByKey.get(p.from) ?? p.from;
                  const toLabel = labelByKey.get(p.to) ?? p.to;
                  const seq = p.from.split(":")[0];
                  const count = countByKey.get(p.from) ?? 0;
                  return (
                    <li key={`${p.from}->${p.to}`} style={{ margin: "0.15rem 0" }}>
                      청크 {seq}: {fromLabel} (발화 {count}회) → {toLabel} (같은 청크)
                    </li>
                  );
                })}
              </ul>
              <div className={styles.suggestCardActions}>
                <button
                  type="button"
                  className={styles.suggestApply}
                  onClick={() => {
                    onApplyExcessMerge(proposals);
                    setSuggestionState("applied");
                  }}
                >
                  자동 병합 적용
                </button>
                <button
                  type="button"
                  className={styles.suggestDismiss}
                  onClick={() => setSuggestionState("dismissed")}
                >
                  무시
                </button>
              </div>
            </div>
          )}

          {rows.map((row) => (
            <SpeakerRowView
              key={row.originalSpeakers.join("|")}
              row={row}
              attendeeOptions={attendeeOptions}
              disabled={disabled}
              onPick={(name) => {
                const next: SpeakerMapping = { ...mapping };
                for (const key of row.originalSpeakers) {
                  if (name) next[key] = name;
                  else delete next[key];
                }
                onChange(next);
              }}
              onAddAttendee={(name) => onAttendeeAdd?.(name)}
            />
          ))}

          <p className={styles.helper}>
            나중에 결과 화면에서도 수정할 수 있습니다.
          </p>
        </div>
      )}
    </section>
  );
}

interface RowProps {
  row: SpeakerRow;
  attendeeOptions: string[];
  disabled: boolean;
  onPick: (name: string) => void;
  onAddAttendee: (name: string) => void;
}

function formatAbsorbed(rawKeys: string[]): string {
  const parts = rawKeys.map((k) => {
    const [seq, label] = k.split(":");
    return `청크 ${seq} 화자 ${label}`;
  });
  return `${parts.join(", ")}로부터 자동 병합됨`;
}

function SpeakerRowView({
  row,
  attendeeOptions,
  disabled,
  onPick,
  onAddAttendee,
}: RowProps) {
  const [mode, setMode] = useState<"select" | "freetext">(
    row.currentName && !attendeeOptions.includes(row.currentName)
      ? "freetext"
      : "select"
  );
  const [draft, setDraft] = useState(
    mode === "freetext" ? row.currentName : ""
  );
  const isComposingRef = useRef(false);

  const commitFreeText = () => {
    const name = draft.trim();
    if (!name) {
      setMode("select");
      return;
    }
    onPick(name);
    if (!attendeeOptions.includes(name)) onAddAttendee(name);
    setDraft("");
    setMode("select");
  };

  const label =
    row.originalSpeakers.length > 1
      ? `화자 ${row.globalIndex}·병합`
      : `화자 ${row.globalIndex}`;

  const autoMergedCount = row.absorbedRawKeys.length;
  const absorbedTitle =
    autoMergedCount > 0 ? formatAbsorbed(row.absorbedRawKeys) : undefined;

  return (
    <div className={styles.row} role="group" aria-label={`${label}의 실제 이름`}>
      <div className={styles.rowLabel}>
        {label}
        {autoMergedCount > 0 && (
          <span
            className={styles.autoBadge}
            title={absorbedTitle}
            aria-label={`자동 병합 ${autoMergedCount}개. ${absorbedTitle}`}
          >
            자동 병합 {autoMergedCount}개
          </span>
        )}
      </div>
      {mode === "select" ? (
        <select
          className={styles.select}
          disabled={disabled}
          value={row.currentName}
          aria-label={`${label} 이름 선택`}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "__free__") {
              setMode("freetext");
              setDraft("");
            } else {
              onPick(v);
            }
          }}
        >
          <option value="">선택...</option>
          {attendeeOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value="__free__">직접 입력...</option>
        </select>
      ) : (
        <input
          className={styles.freeInput}
          autoFocus
          disabled={disabled}
          value={draft}
          placeholder="이름 입력 후 Enter"
          aria-label={`${label} 직접 입력`}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isComposingRef.current) {
              e.preventDefault();
              commitFreeText();
            } else if (e.key === "Escape") {
              setDraft("");
              setMode("select");
            }
          }}
          onBlur={commitFreeText}
        />
      )}
      <div className={styles.count}>발화 {row.count}회</div>
    </div>
  );
}
