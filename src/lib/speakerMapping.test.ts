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

  it("assigns globalIndex on first encounter, not on later occurrences", () => {
    const segs = [
      seg(1, "A:A"),
      seg(2, "B:B"),
      seg(3, "A:A"),
      seg(4, "C:C"),
      seg(5, "B:B"),
    ];
    expect(getSpeakerStats(segs)).toEqual([
      { originalSpeaker: "A:A", count: 2, globalIndex: 1 },
      { originalSpeaker: "B:B", count: 2, globalIndex: 2 },
      { originalSpeaker: "C:C", count: 1, globalIndex: 3 },
    ]);
  });
});

import { resolveSegments } from "./speakerMapping";
import type { SpeakerMapping } from "@/types/meeting";

describe("resolveSegments", () => {
  it("falls back to 화자 N when no mapping", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "안녕하세요"),
      seg(2, "1:2", "반갑습니다"),
    ];
    expect(resolveSegments(segs, {})).toBe(
      "화자 1: 안녕하세요\n\n화자 2: 반갑습니다"
    );
  });

  it("uses mapping when present", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: 안녕");
  });

  it("speakerOverride wins over mapping", () => {
    const segs: Segment[] = [
      { ...seg(1, "1:1", "안녕"), speakerOverride: "김영희" },
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("김영희: 안녕");
  });

  it("merges consecutive same-speaker segments into one block", () => {
    const segs: Segment[] = [
      seg(1, "1:1", "첫 번째"),
      seg(2, "1:1", "두 번째"),
      seg(3, "1:2", "다른 사람"),
      seg(4, "1:1", "다시 첫 번째"),
    ];
    const map: SpeakerMapping = { "1:1": "홍길동", "1:2": "김영희" };
    expect(resolveSegments(segs, map)).toBe(
      "홍길동: 첫 번째\n두 번째\n\n김영희: 다른 사람\n\n홍길동: 다시 첫 번째"
    );
  });

  it("treats empty-string mapping as no mapping (falls back to 화자 N)", () => {
    const segs: Segment[] = [seg(1, "1:1", "안녕")];
    const map: SpeakerMapping = { "1:1": "" };
    expect(resolveSegments(segs, map)).toBe("화자 1: 안녕");
  });

  it("treats whitespace-only override as no override (falls back to mapping)", () => {
    const segs: Segment[] = [
      { ...seg(1, "1:1", "안녕"), speakerOverride: "   " },
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: 안녕");
  });

  it("renders empty-text segments without crashing (current behavior)", () => {
    const segs: Segment[] = [
      seg(1, "1:1", ""),
      seg(2, "1:1", "둘째"),
    ];
    const map: SpeakerMapping = { "1:1": "홍길동" };
    expect(resolveSegments(segs, map)).toBe("홍길동: \n둘째");
  });
});

import { applyMappingToAnalysis } from "./speakerMapping";
import type { AnalysisResult } from "@/types/meeting";

const makeAnalysis = (): AnalysisResult => ({
  title: "주간회의",
  date: "2026-04-13",
  attendees: ["홍길동", "김영희"],
  sections: [
    {
      name: "핵심요약",
      type: "numbered",
      content: [
        { title: "결정", description: "홍길동이 결정함. 김영희는 반대함." },
      ],
    },
    {
      name: "To-Do",
      type: "table",
      content: [
        {
          task: "계약서",
          owner: "홍길동",
          due: "04/20",
          prio: "상",
          notes: "홍길동이 검토",
        },
      ],
    },
  ],
});

describe("applyMappingToAnalysis", () => {
  it("replaces a renamed speaker across all string fields and attendees", () => {
    const analysis = makeAnalysis();
    const old = { "1:1": "홍길동", "1:2": "김영희" };
    const next = { "1:1": "박철수", "1:2": "김영희" };

    const { analysis: out, unresolvedCount, unresolvedNames } =
      applyMappingToAnalysis(analysis, old, next);

    expect(unresolvedCount).toBe(0);
    expect(unresolvedNames).toEqual([]);
    expect(out.attendees).toContain("박철수");
    expect(out.attendees).not.toContain("홍길동");
    expect(out.attendees).toContain("김영희");

    const numbered = out.sections[0];
    if (numbered.type !== "numbered") throw new Error("wrong type");
    expect(numbered.content[0].description).toBe(
      "박철수이 결정함. 김영희는 반대함."
    );

    const table = out.sections[1];
    if (table.type !== "table") throw new Error("wrong type");
    expect(table.content[0].owner).toBe("박철수");
    expect(table.content[0].notes).toBe("박철수이 검토");
  });

  it("respects 조사 boundary: 홍길동이 -> 박철수가 (particle preserved)", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["홍길동"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "홍길동이 말했다" }],
        },
      ],
    };
    const { analysis: out } = applyMappingToAnalysis(
      analysis,
      { "1:1": "홍길동" },
      { "1:1": "박철수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("박철수이 말했다");
  });

  it("does not corrupt substrings (홍길 vs 홍길동, longest-first)", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["홍길", "홍길동"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "홍길동이 왔다. 홍길도 왔다." }],
        },
      ],
    };
    const { analysis: out } = applyMappingToAnalysis(
      analysis,
      { "1:1": "홍길동", "1:2": "홍길" },
      { "1:1": "박철수", "1:2": "이영수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("박철수이 왔다. 이영수도 왔다.");
  });

  it("blocks replacement for stopword-colliding names and reports unresolved", () => {
    const analysis: AnalysisResult = {
      title: "t",
      date: "d",
      attendees: ["김"],
      sections: [
        {
          name: "n",
          type: "numbered",
          content: [{ title: "t", description: "김치 얘기를 했다" }],
        },
      ],
    };
    const { analysis: out, unresolvedNames } = applyMappingToAnalysis(
      analysis,
      { "1:1": "김" },
      { "1:1": "박철수" }
    );
    const sec = out.sections[0];
    if (sec.type !== "numbered") throw new Error("wrong");
    expect(sec.content[0].description).toBe("김치 얘기를 했다");
    expect(unresolvedNames).toContain("김");
  });

  it("no-op when oldMapping and newMapping are identical", () => {
    const analysis = makeAnalysis();
    const map = { "1:1": "홍길동", "1:2": "김영희" };
    const { analysis: out, unresolvedCount } = applyMappingToAnalysis(
      analysis,
      map,
      map
    );
    expect(out).toEqual(analysis);
    expect(unresolvedCount).toBe(0);
  });
});
