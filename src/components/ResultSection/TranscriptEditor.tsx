import React, { useEffect, useRef, useState } from "react";
import styles from "./TranscriptEditor.module.css";
import SpeakerMappingPanel from "@/components/InputSection/SpeakerMappingPanel";
import SegmentOverrideList from "./SegmentOverrideList";
import {
  applyMappingToAnalysis,
  resolveSegments,
} from "@/lib/speakerMapping";
import type {
  AnalysisResult,
  SavedMeetingResultV2,
  Segment,
  SpeakerMapping,
} from "@/types/meeting";

const LOADING_COPIES = [
  "회의 내용을 다시 정리하는 중...",
  "핵심 결정사항 추출 중...",
  "실행과제 정리 중...",
  "거의 완료되었습니다...",
];

interface Props {
  savedResult: SavedMeetingResultV2;
  attendeesCsv: string;
  onUpdate: (
    analysis: AnalysisResult,
    mapping: SpeakerMapping,
    segments: Segment[]
  ) => void;
  onReanalyze: (finalText: string, signal: AbortSignal) => Promise<AnalysisResult>;
}

type UndoSnapshot = {
  analysis: AnalysisResult;
  mapping: SpeakerMapping;
  segments: Segment[];
};

export default function TranscriptEditor({
  savedResult,
  attendeesCsv,
  onUpdate,
  onReanalyze,
}: Props) {
  const [workingMapping, setWorkingMapping] = useState<SpeakerMapping>(
    savedResult.mapping
  );
  const [workingSegments, setWorkingSegments] = useState<Segment[]>(
    savedResult.segments
  );
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([]);
  const [status, setStatus] = useState<string>("");
  const [undo, setUndo] = useState<UndoSnapshot | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [loadingCopyIdx, setLoadingCopyIdx] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setWorkingMapping(savedResult.mapping);
    setWorkingSegments(savedResult.segments);
  }, [savedResult]);

  useEffect(() => {
    if (!isReanalyzing) return;
    setLoadingCopyIdx(0);
    const id = setInterval(() => {
      setLoadingCopyIdx((i) => (i + 1) % LOADING_COPIES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [isReanalyzing]);

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const startUndoTimer = () => {
    clearUndoTimer();
    undoTimerRef.current = setTimeout(() => {
      setUndo(null);
      undoTimerRef.current = null;
    }, 10000);
  };

  const handleMappingChange = (next: SpeakerMapping) => {
    setWorkingMapping(next);
  };

  const handleOverride = (segmentId: string, name: string | undefined) => {
    setWorkingSegments((prev) =>
      prev.map((s) =>
        s.id === segmentId ? { ...s, speakerOverride: name } : s
      )
    );
  };

  const handleApply = () => {
    const snapshot: UndoSnapshot = {
      analysis: savedResult.analysis,
      mapping: savedResult.mapping,
      segments: savedResult.segments,
    };
    const { analysis: newAnalysis, unresolvedNames: unresolved } =
      applyMappingToAnalysis(
        savedResult.analysis,
        savedResult.mapping,
        workingMapping
      );
    setUnresolvedNames(unresolved);
    onUpdate(newAnalysis, workingMapping, workingSegments);
    setStatus("이름이 변경되었습니다");
    setUndo(snapshot);
    startUndoTimer();
  };

  const handleUndo = () => {
    if (!undo) return;
    onUpdate(undo.analysis, undo.mapping, undo.segments);
    setWorkingMapping(undo.mapping);
    setWorkingSegments(undo.segments);
    setUnresolvedNames([]);
    setStatus("변경을 되돌렸습니다");
    setUndo(null);
    clearUndoTimer();
  };

  const handleReanalyze = async () => {
    const ok = window.confirm(
      "회의록을 처음부터 다시 만듭니다. 약 30초가 소요됩니다. 실패하면 기존 결과는 그대로 유지됩니다. 진행할까요?"
    );
    if (!ok) return;
    setIsReanalyzing(true);
    setStatus("회의록을 다시 만들고 있습니다");
    abortControllerRef.current = new AbortController();
    const finalText = resolveSegments(workingSegments, workingMapping);
    try {
      const newAnalysis = await onReanalyze(
        finalText,
        abortControllerRef.current.signal
      );
      onUpdate(newAnalysis, workingMapping, workingSegments);
      setUnresolvedNames([]);
      setStatus("회의록이 새로 생성되었습니다");
    } catch (err) {
      console.error("[TranscriptEditor] reanalyze failed:", err);
      alert(
        `회의록 재생성에 실패했습니다. 기존 결과가 그대로 유지됩니다.\n(${
          err instanceof Error ? err.message : "unknown"
        })`
      );
    } finally {
      setIsReanalyzing(false);
      abortControllerRef.current = null;
    }
  };

  const cancelReanalyze = () => {
    abortControllerRef.current?.abort();
  };

  useEffect(() => () => clearUndoTimer(), []);

  if (workingSegments.length === 0) return null;

  if (isReanalyzing) {
    return (
      <div className={styles.loading} role="status" aria-live="polite">
        <p className={styles.loadingCopy}>{LOADING_COPIES[loadingCopyIdx]}</p>
        <button className={styles.btnSecondary} onClick={cancelReanalyze}>
          취소
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <span className={styles.srOnly} role="status" aria-live="polite">
        {status}
      </span>

      <SpeakerMappingPanel
        segments={workingSegments}
        mapping={workingMapping}
        attendeesCsv={attendeesCsv}
        defaultCollapsed={unresolvedNames.length === 0}
        isRecording={false}
        isTranscribing={false}
        onChange={handleMappingChange}
        onApplyExcessMerge={() => {}}
        onGlobalUndo={() => {}}
      />

      <SegmentOverrideList
        segments={workingSegments}
        mapping={workingMapping}
        attendeesCsv={attendeesCsv}
        onOverride={handleOverride}
      />

      {unresolvedNames.length > 0 && (
        <div className={styles.callout} role="alert">
          <p className={styles.calloutTitle}>
            ⚠️ 주의: 일부 이름이 자동 반영되지 않았습니다
          </p>
          <p>
            {unresolvedNames.join(", ")} — 회의록 본문에서 치환 실패. 정확히
            반영하려면 &apos;회의록 다시 만들기&apos;를 사용하세요.
          </p>
        </div>
      )}

      <div className={styles.actions}>
        <p className={styles.actionHint}>
          이름만 바꾸면 즉시 반영됩니다. 요약 내용까지 다시 쓰려면 &apos;회의록
          다시 만들기&apos;를 선택하세요.
        </p>
        <button className={styles.btnPrimary} onClick={handleApply}>
          이름만 바꾸기 (빠름)
        </button>
        <button className={styles.btnSecondary} onClick={handleReanalyze}>
          회의록 다시 만들기 (약 30초)
          {unresolvedNames.length > 0 && (
            <span className={styles.recommendedBadge}>권장</span>
          )}
        </button>
      </div>

      {undo && (
        <div className={styles.undoToast} role="status">
          <span>이름이 변경되었습니다.</span>
          <button className={styles.undoBtn} onClick={handleUndo}>
            되돌리기
          </button>
        </div>
      )}
    </div>
  );
}
