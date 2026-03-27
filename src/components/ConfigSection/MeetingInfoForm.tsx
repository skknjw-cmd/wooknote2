import React from "react";
import styles from "./MeetingInfoForm.module.css";

interface MeetingInfo {
  title: string;
  date: string;
  location: string;
  attendees: string;
}

interface Props {
  value: MeetingInfo;
  onChange: (val: MeetingInfo) => void;
}

export default function MeetingInfoForm({ value, onChange }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...value, [e.target.name]: e.target.value });
  };

  return (
    <div className={styles.formContent}>
      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="title">회의 제목</label>
        <input
          id="title"
          name="title"
          type="text"
          className={styles.input}
          placeholder="예: 주간 업무 보고"
          value={value.title}
          onChange={handleChange}
        />
      </div>

      <div className={styles.grid}>
        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="date">일시</label>
          <input
            id="date"
            name="date"
            type="date"
            className={styles.input}
            value={value.date}
            onChange={handleChange}
          />
        </div>

        <div className={styles.formGroup}>
          <label className={styles.label} htmlFor="location">장소</label>
          <input
            id="location"
            name="location"
            type="text"
            className={styles.input}
            placeholder="예: 제 1 회의실"
            value={value.location}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label} htmlFor="attendees">참석자</label>
        <input
          id="attendees"
          name="attendees"
          type="text"
          className={styles.input}
          placeholder="예: 홍길동, 김철수, 이영희"
          value={value.attendees}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
