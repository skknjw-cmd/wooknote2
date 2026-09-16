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
  /** 이 노트가 만든 Notion 페이지. 있으면 새로 만들지 않고 여기에 이어 붙인다. */
  notionPageId?: string;
  /**
   * 이미 Notion에 보낸 발화 수. 이어 녹음 시 이 뒤의 발화만 추가한다.
   * 블록 수가 아니라 발화 수를 세는 이유: 발화 하나가 2000자를 넘으면 블록이 여러 개가
   * 되므로, 블록 만드는 규칙이 바뀌면 블록 수는 어긋난다.
   */
  notionSyncedTurns?: number;
  /**
   * 마지막으로 Notion에 보낸 제목. 앱의 제목이 이것과 다를 때만 페이지 제목을 갱신한다.
   * 매번 덮어쓰면 Notion에서 더 낫게 고쳐 둔 제목이 이어 녹음마다 되돌아간다.
   */
  notionSyncedTitle?: string;
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

/** 매핑 가능한 앱 필드. 제목은 title 타입으로 찾으므로 제외한다. */
export type NotionFieldKey = "meetingDate" | "attendees" | "durationText" | "status" | "entryMethod";

/**
 * 기존 페이지를 갱신할 때 "이번에 바꿀 것" 목록에 쓰는 키.
 * 제목은 매핑 대상이 아니라 title 타입으로 찾으므로 NotionFieldKey에 없다.
 */
export type NotionUpdateKey = NotionFieldKey | "title";

export type NotionFieldMapping = {
  /** 넣을 Notion 속성 이름. null이면 이 필드를 일부러 쓰지 않는다. */
  property: string | null;
  /** select·status 속성일 때 넣을 옵션 이름. 값 속성에서는 쓰지 않는다. */
  option?: string | null;
};

/**
 * 속성 매핑 설정. 한 벌만 두고 어느 data source의 것인지 함께 기록한다.
 * 저장 시 해석된 data source와 다르면 통째로 무시하고 이름 추정으로 돌아간다.
 */
export type NotionMappingConfig = {
  dataSourceId: string;
  dataSourceName: string;
  fields: Partial<Record<NotionFieldKey, NotionFieldMapping>>;
};

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
      /** 매핑이 다른 data source의 것이라 무시됐는가. */
      mappingIgnored?: boolean;
      /** 새로 만들지 않고 기존 페이지에 이어 붙였는가. */
      appended?: boolean;
      /** 이번 저장까지 Notion에 반영된 발화 수. 클라이언트가 노트에 기록한다. */
      syncedTurns?: number;
      syncedTitle?: string;
      /** 기존 페이지를 찾지 못해 새로 만들었는가. */
      pageRecreated?: boolean;
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

/** POST /api/notion/schema 응답. */
export type NotionSchemaResponse =
  | {
      ok: true;
      dataSourceId: string;
      dataSourceName: string;
      properties: Array<{ name: string; type: string; options?: string[] }>;
    }
  | { ok: false; stage: "auth" | "schema"; error: string };

/** 화면 배너가 표시하는 저장 상태. */
export type NotionSaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | {
      kind: "saved";
      skippedProperties: string[];
      mappingIgnored?: boolean;
      appended?: boolean;
      pageRecreated?: boolean;
      /** 저장에 성공한 페이지. 노트에 적어 두면 다음 저장이 여기에 이어 붙는다. */
      pageId?: string;
      syncedTurns?: number;
      syncedTitle?: string;
    }
  /** appended가 참이면 이미 있는 페이지에 일부만 붙은 상태다 — 재시도는 중복을 만든다. */
  | { kind: "partial"; savedBlocks: number; totalBlocks: number; appended?: boolean }
  | { kind: "unconfigured" }
  | { kind: "failed"; message: string }
  /** 로컬(IndexedDB) 저장 자체가 실패한 상태. 이 회의는 어디에도 저장되지 않았다. */
  | { kind: "localFailed"; message: string };
