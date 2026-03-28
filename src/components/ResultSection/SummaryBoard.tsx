import React from "react";
import styles from "./SummaryBoard.module.css";

interface AnalysisResult {
  title: string;
  date: string;
  location?: string;
  attendees: string[];
  sections: {
    name: string;
    type?: "text" | "list" | "table" | "numbered";
    content: any;
  }[];
}

interface Props {
  result: AnalysisResult;
}

export default function SummaryBoard({ result }: Props) {
  const renderSectionContent = (sec: any) => {
    const { type, content } = sec;

    if (type === "table" && Array.isArray(content)) {
      return (
        <div className={styles.tableWrapper}>
          <table className={styles.actionTable}>
            <thead data-pdf-table-header>
              <tr>
                <th>실행과제</th>
                <th>담당자</th>
                <th>기한</th>
                <th>우선순위</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {content.map((row: any, i: number) => (
                <tr key={i} data-pdf-item>
                  <td>{row.task}</td>
                  <td>{row.owner}</td>
                  <td>{row.due}</td>
                  <td>{row.prio}</td>
                  <td>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (type === "numbered" && Array.isArray(content)) {
      return (
        <div className={styles.numberedContainer}>
          {content.map((item: any, i: number) => (
            <div key={i} data-pdf-item className={styles.numberedItem}>
              <div className={styles.numberedIndex}>
                {(i + 1).toString().padStart(2, "0")}
              </div>
              <div className={styles.numberedContent}>
                <div className={styles.numberedTitle}>{item.title}</div>
                <div className={styles.numberedDesc}>{item.description}</div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (Array.isArray(content)) {
      return (
        <div className={styles.content}>
          {content.map((text: string, i: number) => (
            <div key={i} data-pdf-item className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className={styles.content}>
        <p data-pdf-item>{content}</p>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.resultCard}>
        {/* Header Section (Title, Date, Attendees) */}
        <div data-pdf-section className={styles.section} style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>{result.title}</h1>
          <p style={{ color: "#888", fontSize: "0.95rem", letterSpacing: "0.05em", marginBottom: "2rem" }}>
            {result.date} {result.location && `| ${result.location}`}
          </p>

          {/* Attendees moved to Header */}
          {result.attendees.length > 0 && (
            <div className={styles.attendees} style={{ justifyContent: "center", borderTop: "1px solid #eee", paddingTop: "1.5rem" }}>
              <span style={{ fontSize: "0.85rem", color: "#888", marginRight: "10px", fontWeight: 600 }}>참석자:</span>
              {result.attendees.map((a, i) => (
                <span key={i} className={styles.attendeeTag}>{a}</span>
              ))}
            </div>
          )}
        </div>

        {/* Dynamic Analysis Sections */}
        {result.sections.map((sec, idx) => {
          const isCompact = sec.name.includes("요약") || sec.name.includes("정보");
          return (
            <div key={idx} data-pdf-section className={isCompact ? styles.compactSection : styles.section}>
              <h2 className={styles.sectionHeader}>{sec.name}</h2>
              {renderSectionContent(sec)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
