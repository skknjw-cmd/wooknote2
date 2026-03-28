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
            <thead>
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
                <tr key={i}>
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
            <div key={i} className={styles.numberedItem}>
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
            <div key={i} className={styles.listItem}>
              <span className={styles.bullet}>•</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      );
    }

    return <div className={styles.content}><p>{content}</p></div>;
  };

  return (
    <div className={styles.container}>
      <div className={styles.resultCard}>
        <div className={styles.section} style={{ textAlign: "center", marginBottom: "4rem" }}>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "1rem" }}>{result.title}</h1>
          <p style={{ color: "#888", fontSize: "0.95rem", letterSpacing: "0.05em" }}>
            {result.date} {result.location && `| ${result.location}`}
          </p>
        </div>

        {result.sections.map((sec, idx) => {
          const isCompact = sec.name.includes("요약") || sec.name.includes("정보");
          return (
            <div key={idx} className={isCompact ? styles.compactSection : styles.section}>
              <h2 className={styles.sectionHeader}>{sec.name}</h2>
              {renderSectionContent(sec)}
            </div>
          );
        })}
        
        {result.attendees.length > 0 && (
          <div className={styles.compactSection}>
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
