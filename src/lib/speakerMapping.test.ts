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
