import React from "react";
import styles from "./ExportTools.module.css";

interface Props {
  onExportPDF: () => void;
  onExportWord: () => void;
  onExportNotion: () => void;
  isPdfGenerating?: boolean;
  isWordGenerating?: boolean;
  isNotionSaving?: boolean;
}

export default function ExportTools({ 
  onExportPDF, 
  onExportWord, 
  onExportNotion, 
  isPdfGenerating, 
  isWordGenerating, 
  isNotionSaving 
}: Props) {
  return (
    <div className={styles.container}>
      <button 
        className={`${styles.btn} ${styles.btnSecondary}`} 
        onClick={(e) => { e.stopPropagation(); onExportWord(); }}
        disabled={isPdfGenerating || isWordGenerating || isNotionSaving}
      >
        {isWordGenerating ? "생성 중..." : "MS-Word 다운로드"}
      </button>
      <button 
        className={`${styles.btn} ${styles.btnSecondary}`} 
        onClick={(e) => { e.stopPropagation(); onExportPDF(); }}
        disabled={isPdfGenerating || isWordGenerating || isNotionSaving}
      >
        {isPdfGenerating ? "저장 중..." : "PDF 저장"}
      </button>
      <button 
        className={`${styles.btn} ${styles.btnNotion}`} 
        onClick={(e) => { e.stopPropagation(); onExportNotion(); }}
        disabled={isPdfGenerating || isWordGenerating || isNotionSaving}
      >
        {isNotionSaving ? "기록 중..." : "Notion 기록"}
      </button>
    </div>
  );
}
