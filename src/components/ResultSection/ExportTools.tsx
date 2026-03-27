import React from "react";
import styles from "./ExportTools.module.css";

interface Props {
  onExportPDF: () => void;
  onExportWord: () => void;
  onExportNotion: () => void;
  isExporting?: boolean;
}

export default function ExportTools({ onExportPDF, onExportWord, onExportNotion, isExporting }: Props) {
  return (
    <div className={styles.container}>
      <button 
        className={`${styles.btn} ${styles.btnSecondary}`} 
        onClick={onExportWord}
        disabled={isExporting}
      >
        MS-Word 다운로드
      </button>
      <button 
        className={`${styles.btn} ${styles.btnSecondary}`} 
        onClick={onExportPDF}
        disabled={isExporting}
      >
        PDF 저장
      </button>
      <button 
        className={`${styles.btn} ${styles.btnNotion}`} 
        onClick={onExportNotion}
        disabled={isExporting}
      >
        {isExporting ? "기록 중..." : "Notion 기록"}
      </button>
    </div>
  );
}
