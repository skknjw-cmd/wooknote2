"use client";

import React from "react";
import styles from "./AnalysisOptions.module.css";

const OPTIONS = [
  "핵심요약",
  "주요 논의 내용",
  "아젠다별 요약",
  "주요 결정 사항",
  "To-Do List",
  "리스크/이슈",
  "향후 일정",
  "미결정사항",
];

interface Props {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function AnalysisOptions({ selected, onChange }: Props) {
  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((item) => item !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className={styles.grid}>
      {OPTIONS.map((opt) => (
        <label
          key={opt}
          className={`${styles.checkboxLabel} ${selected.includes(opt) ? styles.checked : ""}`}
        >
          <input
            type="checkbox"
            className={styles.nativeCheckbox}
            checked={selected.includes(opt)}
            onChange={() => toggleOption(opt)}
          />
          <span className={styles.labelText}>{opt}</span>
        </label>
      ))}
    </div>
  );
}
