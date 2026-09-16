"use client";

import React from "react";
import type { NotionSaveState } from "@/types/meeting";
import { notionPageUrl } from "@/lib/notionPageUrl";

export interface NotionStatusPanelProps {
  status: NotionSaveState;
  notionPageId?: string;
  syncedTurns?: number;
  totalTurns: number;
  onRetry?: () => void;
  onSettings?: () => void;
  onOpenAnalysis: () => void;
  analyzing?: boolean;
}

/**
 * 저장 상태를 문구와 아이콘으로 옮긴다.
 *
 * 이 문구들을 쓰는 곳은 여기뿐이다. 새로 지어내거나 옆에 복사본을 두면 이전 단계에서
 * 맞춰 놓은 사실관계(페이지 재생성 / 무시된 매핑 / 부분 저장 뒤의 재시도가 중복을
 * 만든다는 점)가 다시 갈라진다. 헤더 칩은 한 마디만 필요해서 AppShell이 따로 짧은
 * 매핑을 쓴다 — 이 문장들을 거기로 옮기지 않는다.
 *
 * notionPageId를 같이 받는 이유는 아래 idle 분기 주석 참고.
 */
function bannerText(status: NotionSaveState, notionPageId?: string): { ico: string; text: React.ReactNode } {
  switch (status.kind) {
    case "saving":
      // 중지 직후의 마지막 음성 처리와 그 뒤의 저장을 한 문구로 덮는다. 두 단계 모두
      // "아직 저장되지 않았다"는 같은 사실을 말해야 하므로 Notion만 집어 말하지 않는다.
      return { ico: "⏳", text: <span><b>저장 중…</b> 마지막 음성을 처리하고 저장하는 중입니다.</span> };
    case "saved": {
      const parts: string[] = [];
      if (status.skippedProperties.length > 0) parts.push(`건너뛴 속성: ${status.skippedProperties.join(", ")}`);
      if (status.mappingIgnored) parts.push("매핑이 다른 데이터베이스의 것이라 무시했습니다 — 설정에서 다시 연결 테스트를 해주세요");
      // 이어 붙였는지 새로 만들었는지는 사용자가 Notion에서 무엇을 보게 될지를 바꾼다.
      // 페이지를 다시 만든 경우는 특히 알려야 한다 — 앞의 회의록이 사라졌다는 뜻이다.
      const where = status.pageRecreated
        ? "기존 페이지를 찾을 수 없어 새 페이지로 저장됨"
        : status.appended
          ? "기존 Notion 페이지에 이어 붙임"
          : "Notion에 기록됨";
      return {
        ico: status.pageRecreated ? "⚠️" : "✅",
        text: parts.length > 0
          ? <span><b>저장 완료</b> · {where} ({parts.join(" / ")})</span>
          : <span><b>저장 완료</b> · {where}</span>,
      };
    }
    case "partial":
      return {
        ico: "⚠️",
        text: (
          <span>
            <b>일부만 저장됨</b> ({status.savedBlocks}/{status.totalBlocks} 블록) ·{" "}
            {status.appended
              ? "다시 시도하면 이미 올라간 부분이 중복될 수 있습니다."
              : "다시 시도하면 새 페이지가 만들어집니다."}
          </span>
        ),
      };
    case "unconfigured":
      return { ico: "💾", text: <span><b>로컬에 저장됨</b> · Notion 미설정</span> };
    case "failed":
      return { ico: "❌", text: <span><b>Notion 저장 실패</b> · 로컬에는 저장됨 — {status.message}</span> };
    // 로컬(IndexedDB) 저장 자체가 실패해 이 회의는 어디에도 저장되지 않은 상태.
    // "저장됨"류 표현을 절대 쓰지 않는다 — 위험을 숨기면 안 된다.
    case "localFailed":
      return { ico: "❌", text: <span><b>저장 실패</b> — {status.message}</span> };
    // idle은 "이번 세션에서 아직 Notion으로 보내지 않았다"는 뜻일 뿐이다. 노트를 바꿀 때
    // page.tsx의 handleOpenNote가 이 상태를 idle로 되돌리는데, notionPageId와
    // notionSyncedTurns는 IndexedDB에 그대로 남아 있다. 그래서 세션 상태만 보고
    // "아직 저장하지 않았습니다"라고 하면, 사이드바에서 예전 노트를 열었을 때 바로 아래에
    // 붙는 [Notion에서 열기] 링크·"발화 N/M 동기화" 줄과 정면으로 어긋난다.
    default:
      return notionPageId
        ? { ico: "✅", text: <span><b>Notion에 저장되어 있습니다.</b> 이번 세션에서는 아직 보내지 않았습니다.</span> }
        : { ico: "⏺", text: <span><b>아직 저장하지 않았습니다.</b></span> };
  }
}

export default function NotionStatusPanel({
  status,
  notionPageId,
  syncedTurns,
  totalTurns,
  onRetry,
  onSettings,
  onOpenAnalysis,
  analyzing = false,
}: NotionStatusPanelProps) {
  const { ico, text } = bannerText(status, notionPageId);

  // 저장에 성공한 뒤에도 다시 보낼 수 있어야 한다 — 제목·참석자를 고친 뒤 이 버튼이
  // 없으면 Notion 페이지는 낡은 값을 그대로 달고 있는다. 실패·부분 저장은 재시도 대상이다.
  // 사이드바에서 다시 연 노트(idle + notionPageId)도 마찬가지다. 이 경우를 빼면 이미
  // 저장된 노트의 제목·참석자 수정을 Notion으로 밀어 올릴 버튼이 화면에 하나도 없다.
  const canResend =
    (status.kind === "saved" && !!status.pageId) || (status.kind === "idle" && !!notionPageId);
  const canRetry = status.kind === "failed" || status.kind === "partial" || canResend;

  const skippedProperties = status.kind === "saved" ? status.skippedProperties : [];
  const url = notionPageUrl(notionPageId);

  return (
    <div className="notion-panel">
      <div className="n-row">
        <span className="n-ico">{ico}</span>
        <div className="n-text">{text}</div>
      </div>

      {skippedProperties.length > 0 && (
        <ul className="n-skipped">
          {skippedProperties.map((prop) => (
            <li key={prop}>{prop}</li>
          ))}
        </ul>
      )}

      {url && (
        <a className="n-link" href={url} target="_blank" rel="noopener noreferrer">
          Notion에서 열기 ↗
        </a>
      )}

      {syncedTurns !== undefined && (
        <div className="n-synced">발화 {syncedTurns}/{totalTurns} 동기화</div>
      )}

      <div className="n-actions">
        {canRetry && (
          <button className="btn" onClick={onRetry}>
            {canResend ? "Notion 갱신" : "다시 시도"}
          </button>
        )}
        {status.kind === "unconfigured" && (
          <button className="btn" onClick={onSettings}>설정</button>
        )}
      </div>

      <div className="n-footer">
        <button className="btn" onClick={onOpenAnalysis} disabled={analyzing}>
          다시 정리
        </button>
      </div>
    </div>
  );
}
