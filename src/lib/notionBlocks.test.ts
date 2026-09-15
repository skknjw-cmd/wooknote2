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

import { chunkBlocks } from "./notionBlocks";

describe("chunkBlocks", () => {
  const nums = (n: number) => Array.from({ length: n }, (_, i) => i);

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(chunkBlocks([], 100)).toEqual([]);
  });

  it("99개는 1덩어리다", () => {
    const out = chunkBlocks(nums(99), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(99);
  });

  it("정확히 100개도 1덩어리다", () => {
    const out = chunkBlocks(nums(100), 100);
    expect(out).toHaveLength(1);
    expect(out[0]).toHaveLength(100);
  });

  it("101개는 100 + 1 두 덩어리다", () => {
    const out = chunkBlocks(nums(101), 100);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(100);
    expect(out[1]).toEqual([100]);
  });

  it("250개는 100 + 100 + 50 세 덩어리다", () => {
    const out = chunkBlocks(nums(250), 100);
    expect(out.map((c) => c.length)).toEqual([100, 100, 50]);
  });

  it("size 기본값은 100이다", () => {
    expect(chunkBlocks(nums(101))).toHaveLength(2);
  });
});
