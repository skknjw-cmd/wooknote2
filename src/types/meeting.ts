// src/types/meeting.ts

/**
 * One utterance unit. Clova segment + frontend-assigned stable ID.
 * originalSpeaker is namespaced ("${sequenceId}:${clovaLabel}") so the
 * same Clova label in different 2-minute chunks doesn't collide.
 */
export type Segment = {
  id: string; // "seg_000001" monotonic counter
  sequenceId: number; // recording chunk order
  originalSpeaker: string; // e.g. "1:1", "2:1" — group key; may be rewritten by auto-merge
  rawClovaKey?: string; // immutable "${sequenceId}:${clovaLabel}" for undo of auto-merge
  text: string;
  start?: number; // cumulative ms from recording start
  end?: number;
  speakerOverride?: string; // per-segment override, wins over mapping
};

/**
 * originalSpeaker (namespaced) -> real name.
 * Empty-string values are stripped on save (treated as "no mapping").
 */
export type SpeakerMapping = Record<string, string>;

export type AnalysisSectionNumbered = {
  name: string;
  type: "numbered";
  content: Array<{ title: string; description: string }>;
};

export type AnalysisSectionTable = {
  name: string;
  type: "table";
  content: Array<{
    task: string;
    owner: string;
    due: string;
    prio: string;
    notes: string;
  }>;
};

export type AnalysisSection = AnalysisSectionNumbered | AnalysisSectionTable;

export type AnalysisResult = {
  title: string;
  date: string;
  attendees: string[];
  sections: AnalysisSection[];
};

export type MeetingInfo = {
  title: string;
  date: string;
  location: string;
  attendees: string;
};

/**
 * Full snapshot stored in localStorage["last_meeting_result"].
 * Always writes schemaVersion: 2. A loader migrates v1 on read.
 */
export type SavedMeetingResultV2 = {
  schemaVersion: 2;
  analysis: AnalysisResult;
  segments: Segment[];
  mapping: SpeakerMapping;
  meetingInfo: MeetingInfo;
  selectedOptions: string[];
  generatedAt: string; // ISO
  expiresAt: string; // ISO, generatedAt + 30 days
};

/** Legacy shape (pure AnalysisResult dumped directly). */
export type SavedMeetingResultV1 = AnalysisResult;

export type SavedMeetingResult = SavedMeetingResultV2 | SavedMeetingResultV1;

/** Input state carried by the main page form. */
export type InputData = {
  type: "text" | "file" | "record";
  content: string | File | Blob | null;
  segments?: Segment[];
  mapping?: SpeakerMapping;
};
