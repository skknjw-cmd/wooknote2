import React from "react";
import styles from "./ExportTools.module.css";

interface Props {
  onExportPDF: () => void;
  onExportWord: () => void;
  onWikiSave: () => void;
  isPdfGenerating?: boolean;
  isWordGenerating?: boolean;
  wikiSaveStatus?: "idle" | "saving" | "done" | "error";
  hasWikiDir?: boolean;
}

export default function ExportTools({
  onExportPDF,
  onExportWord,
  onWikiSave,
  isPdfGenerating,
  isWordGenerating,
  wikiSaveStatus = "idle",
  hasWikiDir = false,
}: Props) {
  const isBusy = isPdfGenerating || isWordGenerating || wikiSaveStatus === "saving";

  const wikiLabel = (() => {
    if (wikiSaveStatus === "saving") return "저장 중...";
    if (wikiSaveStatus === "done") return "✓ 저장됨";
    if (!hasWikiDir) return "📁 위키 폴더 선택 후 저장";
    return "💾 위키에 저장";
  })();

  return (
    <div className={styles.container}>
      <button
        className={`${styles.btn} ${styles.btnSecondary}`}
        onClick={(e) => { e.stopPropagation(); onExportWord(); }}
        disabled={isBusy}
      >
        {isWordGenerating ? "생성 중..." : "MS-Word 다운로드"}
      </button>
      <button
        className={`${styles.btn} ${styles.btnSecondary}`}
        onClick={(e) => { e.stopPropagation(); onExportPDF(); }}
        disabled={isBusy}
      >
        {isPdfGenerating ? "저장 중..." : "PDF 저장"}
      </button>
      <button
        className={`${styles.btn} ${styles.btnWiki}`}
        onClick={(e) => { e.stopPropagation(); onWikiSave(); }}
        disabled={isBusy || wikiSaveStatus === "done"}
      >
        {wikiLabel}
      </button>
    </div>
  );
}
