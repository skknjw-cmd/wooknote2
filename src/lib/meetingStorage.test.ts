import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  loadMeetingResult,
  saveMeetingResult,
  clearMeetingResult,
} from "./meetingStorage";
import type {
  AnalysisResult,
  SavedMeetingResultV2,
  MeetingInfo,
} from "@/types/meeting";

const KEY = "last_meeting_result";

const baseAnalysis: AnalysisResult = {
  title: "t",
  date: "2026-04-13",
  attendees: [],
  sections: [],
};

const baseMeetingInfo: MeetingInfo = {
  title: "t",
  date: "2026-04-13",
  location: "",
  attendees: "",
};

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("meetingStorage", () => {
  it("returns null when nothing is stored", () => {
    expect(loadMeetingResult()).toBeNull();
  });

  it("round-trips a v2 save/load", () => {
    saveMeetingResult({
      analysis: baseAnalysis,
      segments: [],
      mapping: {},
      meetingInfo: baseMeetingInfo,
      selectedOptions: ["핵심요약"],
      generatedAt: new Date("2026-04-13T09:00:00Z").toISOString(),
    });
    const loaded = loadMeetingResult();
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(2);
    expect(loaded!.analysis).toEqual(baseAnalysis);
    expect(loaded!.expiresAt).toBeDefined();
  });

  it("migrates legacy v1 shape to v2 on load", () => {
    localStorage.setItem(KEY, JSON.stringify(baseAnalysis));
    const loaded = loadMeetingResult();
    expect(loaded).not.toBeNull();
    expect(loaded!.schemaVersion).toBe(2);
    expect(loaded!.segments).toEqual([]);
    expect(loaded!.mapping).toEqual({});
    expect(loaded!.analysis).toEqual(baseAnalysis);
  });

  it("removes expired v2 entries and returns null", () => {
    const expired: SavedMeetingResultV2 = {
      schemaVersion: 2,
      analysis: baseAnalysis,
      segments: [],
      mapping: {},
      meetingInfo: baseMeetingInfo,
      selectedOptions: [],
      generatedAt: "2026-01-01T00:00:00Z",
      expiresAt: "2026-01-31T00:00:00Z",
    };
    localStorage.setItem(KEY, JSON.stringify(expired));
    expect(loadMeetingResult()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clearMeetingResult removes the key", () => {
    localStorage.setItem(KEY, "x");
    clearMeetingResult();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("returns null and clears key on invalid JSON", () => {
    localStorage.setItem(KEY, "not json");
    expect(loadMeetingResult()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
