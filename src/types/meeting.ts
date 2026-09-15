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

// ── Notion 저장 ──

/** Notion 페이지 본문에 들어갈 발화 1개. speaker는 이미 실명으로 해석된 상태. */
export type NotionTurn = {
  speaker: string; // "김팀장" 또는 "화자 2"
  time: string;    // "00:12" — 빈 문자열 가능
  text: string;
};

/**
 * 클라이언트가 /api/notion 으로 보내는 페이로드.
 * NoteRecord를 그대로 보내지 않는 이유: audioBlob(Blob)은 JSON 직렬화가 불가능하고
 * 서버가 speakerMapping 해석 규칙을 알 필요도 없다.
 */
export type NotionMeetingPayload = {
  title: string;
  meetingDate: string;      // "2026-09-15" — Notion date 속성용 ISO date
  location?: string;
  attendees: string[];
  durationText: string;     // "1:23:45" — 빈 문자열 가능
  entryMethod: EntryMethod;
  turns: NotionTurn[];
};

/** /api/notion 응답. */
export type NotionSaveResponse =
  | {
      ok: true;
      pageId: string;
      totalBlocks: number;
      skippedProperties: string[];
      dataSourceName: string;
    }
  | {
      ok: false;
      stage: "append";
      pageId: string;
      savedBlocks: number;
      totalBlocks: number;
      error: string;
    }
  | {
      ok: false;
      stage: "auth" | "schema" | "create";
      error: string;
    };

/** 화면 배너가 표시하는 저장 상태. */
export type NotionSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; skippedProperties: string[] }
  | { kind: "partial"; savedBlocks: number; totalBlocks: number }
  | { kind: "unconfigured" }
  | { kind: "failed"; message: string };
