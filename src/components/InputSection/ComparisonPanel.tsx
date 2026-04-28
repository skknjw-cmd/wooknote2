import styles from "./ComparisonPanel.module.css";

interface ChunkResult {
  seq: number;
  clova: string | null;
  gemini: string | null;
}

interface Props {
  chunks: ChunkResult[];
}

export default function ComparisonPanel({ chunks }: Props) {
  if (chunks.length === 0) return null;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <div className={styles.col}>
          <span className={styles.badge} data-provider="clova">Clova Speech</span>
        </div>
        <div className={styles.col}>
          <span className={styles.badge} data-provider="gemini">Gemini 2.5</span>
        </div>
      </div>

      {chunks.map(({ seq, clova, gemini }) => (
        <div key={seq} className={styles.chunkRow}>
          <div className={styles.seqLabel}>구간 {seq}</div>
          <div className={styles.cols}>
            <div className={styles.col}>
              <pre className={styles.text}>
                {clova ?? <span className={styles.loading}>변환 중...</span>}
              </pre>
            </div>
            <div className={styles.col}>
              <pre className={styles.text}>
                {gemini ?? <span className={styles.loading}>변환 중...</span>}
              </pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
