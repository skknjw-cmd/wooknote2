import { describe, it, expect } from "vitest";
import { stageForStatus, lookupErrorMessage } from "./notionErrors";

describe("stageForStatus", () => {
  it("401·403은 auth", () => {
    expect(stageForStatus(401)).toBe("auth");
    expect(stageForStatus(403)).toBe("auth");
  });

  it("나머지는 schema", () => {
    expect(stageForStatus(400)).toBe("schema");
    expect(stageForStatus(404)).toBe("schema");
    expect(stageForStatus(500)).toBe("schema");
  });
});

describe("lookupErrorMessage", () => {
  it("401은 토큰 확인을 안내한다", () => {
    const m = lookupErrorMessage(401, "unauthorized");
    expect(m).toContain("토큰");
    expect(m).toContain("Internal Integration Token");
    expect(m).toContain("unauthorized");
  });

  it("403도 401과 같은 안내", () => {
    expect(lookupErrorMessage(403, "x")).toBe(lookupErrorMessage(401, "x"));
  });

  it("400은 ID 형식·데이터 소스 불일치를 안내한다", () => {
    const m = lookupErrorMessage(400, "bad id");
    expect(m).toContain("형식");
    expect(m).toContain("bad id");
    expect(m).not.toContain("초대");
  });

  it("404는 통합 초대를 앞세운다 (가장 흔한 원인)", () => {
    const m = lookupErrorMessage(404, "not found");
    expect(m).toContain("초대");
    expect(m).toContain("연결");
    expect(m).toContain("not found");
  });

  it("500도 404와 같은 안내로 떨어진다", () => {
    expect(lookupErrorMessage(500, "x")).toBe(lookupErrorMessage(404, "x"));
  });
});
