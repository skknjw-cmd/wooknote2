import React from "react";
import styles from "./SummaryBoard.module.css";

interface AnalysisResult {
  title: string;
  date: string;
  location?: string;
  attendees: string[];
  sections: {
    name: string;
    content: string | string[];
  }[];
}

interface Props {
  result: AnalysisResult;
}

export default function SummaryBoard({ result }: Props) {
  // Helper to render mixed content safely
  const renderItem = (item: any) => {
    if (typeof item === "object" && item !== null) {
      // If it's an object with keys like {담당자, 내용, 기한}, format it nicely
      return Object.entries(item)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" / ");
    }
    return String(item);
  };

  return (
    <div className={styles.container}>
      <div className={styles.resultCard}>
        <div className={styles.section}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>{result.title}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            {result.date} {result.location && `| ${result.location}`}
          </p>
        </div>

        {result.sections.map((sec, idx) => (
          <div key={idx} className={styles.section}>
            <h2 className={styles.sectionHeader}>{sec.name}</h2>
            <div className={styles.content}>
              {Array.isArray(sec.content) ? (
                sec.content.map((item, i) => (
                  <div key={i} className={styles.listItem}>
                    <span className={styles.bullet}>•</span>
                    <span>{renderItem(item)}</span>
                  </div>
                ))
              ) : (
                <p>{sec.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {result.attendees.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionHeader}>참석자</h2>
            <div className={styles.attendees}>
              {result.attendees.map((a, i) => (
                <span key={i} className={styles.attendeeTag}>{a}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
