import { describe, it, expect } from "vitest";
import { extractDatabaseId } from "./apiKey";

describe("extractDatabaseId", () => {
  it("32자 hex를 그대로 반환한다", () => {
    const id = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    expect(extractDatabaseId(id)).toBe(id);
  });

  it("하이픈이 든 UUID에서 하이픈을 제거한다", () => {
    expect(extractDatabaseId("a1b2c3d4-e5f6-0718-293a-4b5c6d7e8f90")).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
  });

  it("Notion URL에서 데이터베이스 ID를 뽑는다", () => {
    expect(
      extractDatabaseId("https://www.notion.so/myspace/a1b2c3d4e5f60718293a4b5c6d7e8f90?v=abc"),
    ).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("제목이 앞에 붙은 Notion URL에서도 뽑는다", () => {
    expect(
      extractDatabaseId("https://www.notion.so/회의록-a1b2c3d4e5f60718293a4b5c6d7e8f90"),
    ).toBe("a1b2c3d4e5f60718293a4b5c6d7e8f90");
  });

  it("앞뒤 공백을 무시한다", () => {
    expect(extractDatabaseId("  a1b2c3d4e5f60718293a4b5c6d7e8f90  ")).toBe(
      "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    );
  });

  it("ID를 찾을 수 없으면 빈 문자열을 반환한다", () => {
    expect(extractDatabaseId("그냥 텍스트")).toBe("");
    expect(extractDatabaseId("")).toBe("");
  });
});
