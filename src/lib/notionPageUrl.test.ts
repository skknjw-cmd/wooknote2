import { describe, it, expect } from "vitest";
import { notionPageUrl } from "./notionPageUrl";

describe("notionPageUrl", () => {
  it("하이픈 있는 id에서 하이픈을 뺀 URL을 만든다", () => {
    expect(notionPageUrl("1a2b3c4d-5e6f-7890-abcd-ef1234567890"))
      .toBe("https://notion.so/1a2b3c4d5e6f7890abcdef1234567890");
  });

  it("하이픈 없는 id도 그대로 받는다", () => {
    expect(notionPageUrl("1a2b3c4d5e6f7890abcdef1234567890"))
      .toBe("https://notion.so/1a2b3c4d5e6f7890abcdef1234567890");
  });

  it("id가 없으면 null", () => {
    expect(notionPageUrl(undefined)).toBeNull();
    expect(notionPageUrl("")).toBeNull();
  });

  it("공백만 있으면 null", () => {
    expect(notionPageUrl("   ")).toBeNull();
  });
});
