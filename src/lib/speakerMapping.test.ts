import { describe, it, expect } from "vitest";
import { parseAttendees } from "./speakerMapping";

describe("parseAttendees", () => {
  it("splits on commas and trims", () => {
    expect(parseAttendees("홍길동, 김영희, 박철수")).toEqual([
      "홍길동",
      "김영희",
      "박철수",
    ]);
  });

  it("removes empty entries and duplicates preserving first occurrence", () => {
    expect(parseAttendees("홍길동,,김영희 , 홍길동")).toEqual([
      "홍길동",
      "김영희",
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseAttendees("")).toEqual([]);
    expect(parseAttendees("   ")).toEqual([]);
  });
});

import { getSpeakerStats } from "./speakerMapping";
import type { Segment } from "@/types/meeting";

const seg = (i: number, sp: string, text = "x"): Segment => ({
  id: `seg_${String(i).padStart(6, "0")}`,
  sequenceId: Number(sp.split(":")[0]),
  originalSpeaker: sp,
  text,
});

describe("getSpeakerStats", () => {
  it("returns empty array for no segments", () => {
    expect(getSpeakerStats([])).toEqual([]);
  });

  it("counts occurrences per original speaker in encounter order", () => {
    const segs = [
      seg(1, "1:1"),
      seg(2, "1:2"),
      seg(3, "1:1"),
      seg(4, "2:1"),
    ];
    const stats = getSpeakerStats(segs);
    expect(stats).toEqual([
      { originalSpeaker: "1:1", count: 2, globalIndex: 1 },
      { originalSpeaker: "1:2", count: 1, globalIndex: 2 },
      { originalSpeaker: "2:1", count: 1, globalIndex: 3 },
    ]);
  });
});
