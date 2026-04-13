import React, { useMemo, useState } from "react";
import styles from "./SegmentOverrideList.module.css";
import type { Segment, SpeakerMapping } from "@/types/meeting";
import { getSpeakerStats, parseAttendees } from "@/lib/speakerMapping";

interface Props {
  segments: Segment[];
  mapping: SpeakerMapping;
  attendeesCsv: string;
  disabled?: boolean;
  onOverride: (segmentId: string, speakerName: string | undefined) => void;
}

type Block = {
  speakerName: string;
  ids: string[];
  text: string;
  startMs?: number;
};

const formatTimestamp = (ms?: number): string => {
  if (ms === undefined) return "";
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

export default function SegmentOverrideList({
  segments,
  mapping,
  attendeesCsv,
  disabled = false,
  onOverride,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<string>("__all__");
  const [showAll, setShowAll] = useState(false);

  const stats = useMemo(() => getSpeakerStats(segments), [segments]);
  const indexByKey = useMemo(
    () => new Map(stats.map((s) => [s.originalSpeaker, s.globalIndex])),
    [stats]
  );

  const attendeeOptions = useMemo(
    () => parseAttendees(attendeesCsv),
    [attendeesCsv]
  );

  const blocks: Block[] = useMemo(() => {
    const effectiveName = (s: Segment): string => {
      if (s.speakerOverride && s.speakerOverride.trim()) {
        return s.speakerOverride.trim();
      }
      const mapped = mapping[s.originalSpeaker];
      if (mapped && mapped.trim()) return mapped.trim();
      return `화자 ${indexByKey.get(s.originalSpeaker) ?? 0}`;
    };

    const out: Block[] = [];
    for (const s of segments) {
      const name = effectiveName(s);
      const last = out[out.length - 1];
      if (last && last.speakerName === name) {
        last.ids.push(s.id);
        last.text += "\n" + s.text;
      } else {
        out.push({
          speakerName: name,
          ids: [s.id],
          text: s.text,
          startMs: s.start,
        });
      }
    }
    return out;
  }, [segments, mapping, indexByKey]);

  const uniqueNames = useMemo(() => {
    const set = new Set<string>();
    for (const b of blocks) set.add(b.speakerName);
    return Array.from(set);
  }, [blocks]);

  const filteredBlocks = useMemo(
    () =>
      filter === "__all__"
        ? blocks
        : blocks.filter((b) => b.speakerName === filter),
    [blocks, filter]
  );

  const visibleBlocks = showAll ? filteredBlocks : filteredBlocks.slice(0, 50);
  const hiddenCount = filteredBlocks.length - visibleBlocks.length;

  if (segments.length === 0) return null;

  const toggleBlockOverride = (block: Block, name: string | undefined) => {
    for (const id of block.ids) onOverride(id, name);
  };

  return (
    <section className={styles.wrap} aria-label="한 문장씩 직접 고치기">
      <div
        className={styles.header}
        role="button"
        tabIndex={0}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <div>
          <p className={styles.title}>한 문장씩 직접 고치기 (고급)</p>
          <p className={styles.subtitle}>
            대부분의 경우 위에서 이름만 지정하면 충분합니다. Clova가 두 사람을 한 명으로
            합친 경우에만 사용하세요.
          </p>
        </div>
        <span>{open ? "▴" : "▾"}</span>
      </div>

      {open && (
        <>
          <div className={styles.toolbar}>
            <label htmlFor="seg-filter" style={{ fontSize: "0.85rem" }}>
              특정 화자만 보기:
            </label>
            <select
              id="seg-filter"
              className={styles.filterSelect}
              value={filter}
              disabled={disabled}
              onChange={(e) => {
                setFilter(e.target.value);
                setShowAll(false);
              }}
            >
              <option value="__all__">전체</option>
              {uniqueNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {visibleBlocks.map((b, i) => (
            <div key={`${b.ids[0]}-${i}`} className={styles.block}>
              <div className={styles.blockHeader}>
                {b.startMs !== undefined && (
                  <span>{formatTimestamp(b.startMs)}</span>
                )}
                <select
                  className={styles.blockSelect}
                  disabled={disabled}
                  value={b.speakerName}
                  aria-label={`${b.speakerName} 블록의 화자 변경`}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__reset__") {
                      toggleBlockOverride(b, undefined);
                    } else {
                      toggleBlockOverride(b, v);
                    }
                  }}
                >
                  <option value={b.speakerName}>{b.speakerName}</option>
                  {attendeeOptions
                    .filter((n) => n !== b.speakerName)
                    .map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  <option value="__reset__">(기본 매핑으로 복귀)</option>
                </select>
              </div>
              <div className={styles.blockLines}>{b.text}</div>
            </div>
          ))}

          {hiddenCount > 0 && (
            <button
              className={styles.showMore}
              onClick={() => setShowAll(true)}
            >
              {hiddenCount}개 더 보기
            </button>
          )}
        </>
      )}
    </section>
  );
}
