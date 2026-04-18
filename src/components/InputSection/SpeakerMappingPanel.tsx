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
