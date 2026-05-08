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

// ── V2 types ──

export type Participant = {
  sp: number;
  name: string;
  role: string;
  initials: string;
};

export type ActionItem = {
  who: string;
  what: string;
  when: string;
  done: boolean;
  notes?: string; // 완료기준
};

export type NoteRecord = {
  id: string;
  title: string;
  createdAt: number;
  meetingDate?: string;   // 사용자가 편집한 회의 일시 (없으면 createdAt 포맷 사용)
  location?: string;      // 회의 장소
  attendees?: string;     // 자유 텍스트 참석자 (쉼표 구분)
  entryMethod?: EntryMethod;
  segments: TurnSegment[];
  speakerMapping: Record<string, string>;
  participants: Participant[];
  audioBlob?: Blob;
  audioDuration: number;
  keywords: string[];
  memo: string;
  summaryBullets: string[];
  summarySource?: "auto" | "manual"; // 사용자가 직접 편집하면 manual로 전환
  actions: ActionItem[];
  decisions: string[];
  questions: string[];
  nextAgenda: string[];
  context: string;
  discussions?: DiscussionItem[];
  quotes?: QuoteCard[]; // 타임스탬프 앵커 인용 목록
};

export type TurnSegment = {
  id: number;
  sp: number;
  t: string;
  text: string;
  typing?: boolean;
  anchored?: boolean; // 타임스탬프 클릭으로 노트 context 블록에 인용됨
};

export type NoteBlockType =
  | "ai_summary"
  | "context"
  | "decisions"
  | "actions"
  | "questions"
  | "participants"
  | "next_agenda"
  | "free_memo";

export type NoteBlock = {
  id: string;
  type: NoteBlockType;
  source: "auto" | "manual"; // manual = 사용자 수정 시 자동 갱신 보호
  updatedAt: string; // ISO
  hidden?: boolean;
};

export type DiscussionItem = {
  title: string;
  background?: string;
  discussion?: string;
  conclusion?: string;
};

export type QuoteCard = {
  turnId: number;
  text: string;
  speakerName: string;
  timestamp: string;
};

/** 노트 입력 방식 */
export type EntryMethod = "live" | "text" | "audio" | "video";
