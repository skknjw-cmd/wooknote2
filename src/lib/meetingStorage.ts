// src/lib/meetingStorage.ts
import type {
  SavedMeetingResultV2,
  SavedMeetingResult,
  AnalysisResult,
  MeetingInfo,
  Segment,
  SpeakerMapping,
} from "@/types/meeting";

const STORAGE_KEY = "last_meeting_result";
const TTL_DAYS = 30;

export type SaveInput = {
  analysis: AnalysisResult;
  segments: Segment[];
  mapping: SpeakerMapping;
  meetingInfo: MeetingInfo;
  selectedOptions: string[];
  generatedAt?: string;
};

export function saveMeetingResult(input: SaveInput): void {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const expiresAt = new Date(
    new Date(generatedAt).getTime() + TTL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const record: SavedMeetingResultV2 = {
    schemaVersion: 2,
    analysis: input.analysis,
    segments: input.segments,
    mapping: input.mapping,
    meetingInfo: input.meetingInfo,
    selectedOptions: input.selectedOptions,
    generatedAt,
    expiresAt,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch (err) {
    console.error("[meetingStorage] save failed:", err);
    throw err;
  }
}

export function loadMeetingResult(): SavedMeetingResultV2 | null {
  const raw =
    typeof localStorage !== "undefined"
      ? localStorage.getItem(STORAGE_KEY)
      : null;
  if (!raw) return null;
  let parsed: SavedMeetingResult;
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    (parsed as SavedMeetingResultV2).schemaVersion === 2
  ) {
    const v2 = parsed as SavedMeetingResultV2;
    if (v2.expiresAt && new Date(v2.expiresAt).getTime() < Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return v2;
  }
  const v1 = parsed as AnalysisResult;
  if (!v1 || typeof v1 !== "object" || !Array.isArray(v1.sections)) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return migrateV1ToV2(v1);
}

export function clearMeetingResult(): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function migrateV1ToV2(v1: AnalysisResult): SavedMeetingResultV2 {
  const now = new Date();
  return {
    schemaVersion: 2,
    analysis: v1,
    segments: [],
    mapping: {},
    meetingInfo: {
      title: v1.title ?? "",
      date: v1.date ?? "",
      location: "",
      attendees: Array.isArray(v1.attendees) ? v1.attendees.join(", ") : "",
    },
    selectedOptions: [],
    generatedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + TTL_DAYS * 24 * 60 * 60 * 1000
    ).toISOString(),
  };
}
