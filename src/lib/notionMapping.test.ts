import { describe, it, expect, beforeEach } from "vitest";
import { getNotionMapping, setNotionMapping } from "./apiKey";
import type { NotionMappingConfig } from "@/types/meeting";

const sample: NotionMappingConfig = {
  dataSourceId: "ds-1",
  dataSourceName: "회의록",
  fields: {
    meetingDate: { property: "회의일자" },
    durationText: { property: null },
    status: { property: "진행", option: "대기" },
  },
};

describe("Notion 매핑 저장소", () => {
  beforeEach(() => localStorage.clear());

  it("저장한 값을 그대로 돌려준다", () => {
    setNotionMapping(sample);
    expect(getNotionMapping()).toEqual(sample);
  });

  it("값이 없으면 null", () => {
    expect(getNotionMapping()).toBeNull();
  });

  it("null을 저장하면 항목을 지운다", () => {
    setNotionMapping(sample);
    setNotionMapping(null);
    expect(localStorage.getItem("autonote_notion_mapping")).toBeNull();
    expect(getNotionMapping()).toBeNull();
  });

  it("손상된 JSON이면 null (저장이 막히면 안 된다)", () => {
    localStorage.setItem("autonote_notion_mapping", "{ 이건 JSON이 아님");
    expect(getNotionMapping()).toBeNull();
  });

  it("모양이 맞지 않으면 null", () => {
    localStorage.setItem("autonote_notion_mapping", JSON.stringify({ hello: "world" }));
    expect(getNotionMapping()).toBeNull();
  });

  it("fields가 없으면 null", () => {
    localStorage.setItem("autonote_notion_mapping", JSON.stringify({ dataSourceId: "ds-1" }));
    expect(getNotionMapping()).toBeNull();
  });
});
