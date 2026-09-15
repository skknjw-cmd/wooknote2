import { describe, it, expect } from "vitest";
import { splitText } from "./notionBlocks";

describe("splitText", () => {
  it("한도 미만이면 1개로 반환한다", () => {
    expect(splitText("안녕하세요", 2000)).toEqual(["안녕하세요"]);
  });

  it("정확히 한도 길이면 1개로 반환한다", () => {
    const s = "가".repeat(2000);
    expect(splitText(s, 2000)).toEqual([s]);
  });

  it("한도를 1자 넘으면 2개로 쪼갠다", () => {
    const s = "가".repeat(2001);
    const out = splitText(s, 2000);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(2000);
    expect(out[1]).toBe("가");
    expect(out.join("")).toBe(s);
  });

  it("빈 문자열이면 빈 배열을 반환한다", () => {
    expect(splitText("", 2000)).toEqual([]);
  });

  it("limit 기본값은 2000이다", () => {
    expect(splitText("가".repeat(2001))).toHaveLength(2);
  });
});
