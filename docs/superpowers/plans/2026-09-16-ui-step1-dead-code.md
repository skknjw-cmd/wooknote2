# 1단계: 죽은 코드 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 도달할 수 없는 코드 4,223줄과 눌러도 아무 일 없는 UI를 지워, 2단계 레이아웃 재편의 출발점을 깨끗하게 만든다.

**Architecture:** 삭제가 주된 작업이다. 살아있는 트리는 `src/app/page.tsx` 하나에서만 뻗으므로, 그 트리에 닿지 않는 파일을 지우고 빌드가 통과하는지로 판정이 맞았는지 확인한다. UI 수정은 "동작하지 않는 것을 없애거나 연결하는" 것뿐이고, 화면 구조는 건드리지 않는다.

**Tech Stack:** Next.js 16 App Router · TypeScript · React 19 · vitest

**Spec:** `docs/superpowers/specs/2026-09-16-ui-restructure-design.md`

## Global Constraints

- **`node_modules/next/dist/docs/`를 먼저 읽는다.** 이 저장소의 `AGENTS.md`: "This is NOT the Next.js you know ... Read the relevant guide in `node_modules/next/dist/docs/` before writing any code." 라우트 디렉터리를 지우는 Task 1에 해당한다
- **이 저장소에는 UI 테스트가 0개다.** 단위 테스트는 순수 함수만 덮는다. 렌더링·상호작용 검증은 브라우저에서 직접 한다. 없는 테스트를 있다고 쓰지 않는다
- **기존 실패 1건:** `meetingStorage.test.ts > round-trips a v2 save/load`가 `main`에서 실패한다. Task 2에서 **모듈째 사라진다** — 고쳐서가 아니다
- **검증 명령 3종:** `npx tsc --noEmit` · `npm test` · `npm run build`. 삭제 Task는 셋 다 통과해야 끝난다
- **Windows / Git Bash 환경.** 파일 삭제는 `git rm -r`을 쓴다
- **브랜치:** `feat/ui-step1-cleanup`을 `main`에서 딴다
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

### Task 0: 브랜치 생성과 기준선 기록

**Files:** 없음 (git 작업만)

**Interfaces:**
- Consumes: 없음
- Produces: 브랜치 `feat/ui-step1-cleanup`, 기준선 수치(테스트 통과/실패 개수)

- [ ] **Step 1: `main`이 최신인지 확인하고 브랜치를 만든다**

```bash
cd /c/dev/autonote
git checkout main
git pull --ff-only
git checkout -b feat/ui-step1-cleanup
```

- [ ] **Step 2: 기준선을 기록한다**

```bash
npx vitest run 2>&1 | tail -5
```

기대: `Tests  1 failed | 182 passed (183)` — 실패는 `meetingStorage.test.ts > round-trips a v2 save/load` 하나뿐이다.

**다른 실패가 보이면 여기서 멈추고 보고한다.** 기준선이 다르면 이후 Task의 "통과" 판정이 무의미해진다.

- [ ] **Step 3: 빌드 기준선**

```bash
npx tsc --noEmit && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: `✓ Compiled successfully`

---

### Task 1: `/result` 라우트와 그 전용 컴포넌트 삭제

`/result`로 가는 네비게이션이 코드에 없다. 이 라우트와 여기서만 쓰이는 컴포넌트를 함께 지운다.

**Files:**
- Delete: `src/app/result/page.tsx` (467줄)
- Delete: `src/app/result/page.module.css` (61줄)
- Delete: `src/components/ResultSection/` 전체 (8파일 — `SummaryBoard.tsx` 125 · `TranscriptEditor.tsx` 243 · `ExportTools.tsx` 57 · `SegmentOverrideList.tsx` 201 + CSS 4개 393)
- Delete: `src/components/InputSection/` 전체 (6파일 — `InputTabs.tsx` 544 · `ComparisonPanel.tsx` 46 · `SpeakerMappingPanel.tsx` 324 + CSS 3개 402)
- Delete: `src/components/ConfigSection/` 전체 (4파일 — `AnalysisOptions.tsx` 49 · `MeetingInfoForm.tsx` 77 + CSS 2개 105)

**Interfaces:**
- Consumes: Task 0의 브랜치
- Produces: 없음. 이후 Task는 이 파일들이 없다고 가정한다

- [ ] **Step 1: 삭제 전에 판정을 다시 확인한다**

```bash
cd /c/dev/autonote
grep -rn '"/result"' src --include=*.ts --include=*.tsx | grep -v "^src/app/result/"
grep -rn "router.push" src --include=*.ts --include=*.tsx | grep result
```

기대: **둘 다 출력 없음.** 한 줄이라도 나오면 `/result`는 도달 가능하므로 **여기서 멈추고 보고한다.**

- [ ] **Step 2: `ResultSection` · `InputSection` · `ConfigSection`을 밖에서 쓰는 곳이 `/result` 뿐인지 확인한다**

```bash
grep -rln "ResultSection\|InputSection\|ConfigSection" src --include=*.tsx \
  | grep -v "^src/components/ResultSection/" \
  | grep -v "^src/components/InputSection/" \
  | grep -v "^src/components/ConfigSection/"
```

기대: `src/app/result/page.tsx` 한 줄만.

`src/components/ResultSection/TranscriptEditor.tsx`가 `InputSection/SpeakerMappingPanel`을 쓰지만 둘 다 이번에 함께 사라지므로 문제없다.

- [ ] **Step 3: Next.js 라우트 삭제에 특별한 절차가 있는지 문서를 확인한다**

```bash
ls node_modules/next/dist/docs/
```

App Router의 라우트는 디렉터리 존재 자체로 정의되므로 디렉터리를 지우면 라우트가 사라진다. 등록부(registry) 파일이 따로 있는지 문서에서 확인하고, 있으면 함께 정리한다.

- [ ] **Step 4: 삭제한다**

```bash
git rm -r src/app/result src/components/ResultSection src/components/InputSection src/components/ConfigSection
```

- [ ] **Step 5: 타입 검사와 빌드로 판정을 검증한다**

```bash
npx tsc --noEmit
```

기대: 출력 없음(통과).

**여기서 에러가 나면 지운 파일을 누군가 쓰고 있었다는 뜻이다.** 되살리지 말고 **어느 파일이 무엇을 참조하는지 보고한다** — 도달 불가 판정이 틀렸다는 신호다.

- [ ] **Step 6: 빌드**

```bash
npm run build 2>&1 | tail -20
```

기대: `✓ Compiled successfully`. 라우트 목록에서 `/result`가 사라졌는지 확인한다.

- [ ] **Step 7: 테스트**

```bash
npx vitest run 2>&1 | tail -5
```

기대: `1 failed | 182 passed (183)` — Task 0 기준선과 **동일**. 통과 개수가 줄었으면 지운 파일에 테스트가 딸려 있었다는 뜻이므로 보고한다.

- [ ] **Step 8: 커밋**

```bash
git commit -m "$(cat <<'MSG'
refactor: 도달할 수 없는 /result 라우트와 전용 컴포넌트 삭제

/result로 가는 네비게이션이 코드 어디에도 없다(router.push 0건).
이 라우트와 여기서만 쓰이던 ResultSection·InputSection·ConfigSection을
함께 지운다. 2,016줄.

tsc와 build가 통과하는 것이 도달 불가 판정이 맞았다는 증거다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: 단독 고아 컴포넌트와 lib 삭제

아무도 import 하지 않는 컴포넌트 둘과, Task 1 이후 참조자가 사라진 lib 둘.

**Files:**
- Delete: `src/components/Settings/SettingsModal.tsx` (86줄)
- Delete: `src/components/Settings/SettingsModal.module.css` (114줄)
- Delete: `src/components/Speaker/LiveWithPrompt.tsx` (62줄)
- Delete: `src/lib/meetingStorage.ts` (104줄)
- Delete: `src/lib/meetingStorage.test.ts` (92줄)
- Delete: `src/lib/wikiSave.ts` (61줄)

**Interfaces:**
- Consumes: Task 1 완료 상태(`/result`가 없어야 `meetingStorage`·`wikiSave`가 고아가 된다)
- Produces: 없음

- [ ] **Step 1: 고아 판정을 확인한다**

```bash
cd /c/dev/autonote
for n in SettingsModal LiveWithPrompt meetingStorage wikiSave; do
  echo "-- $n:"
  grep -rln "$n" src --include=*.ts --include=*.tsx | grep -v "$n"
done
```

기대: 네 항목 모두 **출력 없음.**

`SettingsModal`은 `meetingStorage`의 `clearMeetingResult`를 쓰지만, 그 자신이 고아이므로 함께 사라진다. 살아있는 설정 화면은 `Layout/ApiKeyModal`이다(`page.tsx`가 쓴다).

- [ ] **Step 2: 삭제한다**

```bash
git rm src/components/Settings/SettingsModal.tsx \
       src/components/Settings/SettingsModal.module.css \
       src/components/Speaker/LiveWithPrompt.tsx \
       src/lib/meetingStorage.ts \
       src/lib/meetingStorage.test.ts \
       src/lib/wikiSave.ts
```

- [ ] **Step 3: 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

기대: tsc 통과. 테스트는 **`0 failed | 182 passed (182)`** — 실패가 사라진다.

**이것은 결함을 고친 것이 아니다.** 깨진 테스트가 있던 모듈을 통째로 지웠기 때문이다. 커밋 메시지에 그렇게 적는다.

- [ ] **Step 4: 빌드**

```bash
npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: `✓ Compiled successfully`

- [ ] **Step 5: 커밋**

```bash
git commit -m "$(cat <<'MSG'
refactor: 고아 컴포넌트와 lib 삭제 (SettingsModal·LiveWithPrompt·meetingStorage·wikiSave)

아무도 import 하지 않는 컴포넌트 둘, /result와 함께 참조자를 잃은 lib 둘. 519줄.
살아있는 설정 화면은 Layout/ApiKeyModal이다.

이 커밋으로 테스트 스위트가 전부 통과하게 되지만, meetingStorage.test.ts의
깨진 테스트를 **고친 것이 아니라 모듈째 지운 것**이다.

localStorage 키 last_meeting_result에 남은 데이터는 마이그레이션하지 않는다.
IndexedDB의 NoteRecord가 이미 정본이고, 이 키를 읽던 유일한 화면(/result)이
함께 사라졌기 때문이다. 브라우저에 찌꺼기 한 줄이 남는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: `speakerMerge` 삭제 — 별도 판단이 필요한 건

`speakerMerge.ts`는 오직 `InputSection/InputTabs`만 쓴다. Task 1에서 그것이 사라지면 고아가 된다. 다만 **통과하는 테스트 386줄이 딸려 있어** 다른 삭제와 성격이 다르다. 그래서 커밋을 나눠 리뷰어가 이것만 거부할 수 있게 한다.

**Files:**
- Delete: `src/lib/speakerMerge.ts` (224줄)
- Delete: `src/lib/speakerMerge.test.ts` (386줄)

**Interfaces:**
- Consumes: Task 1 완료 상태
- Produces: 없음

- [ ] **Step 1: 고아 판정을 확인한다**

```bash
cd /c/dev/autonote
grep -rln "speakerMerge" src | grep -v speakerMerge
```

기대: **출력 없음.**

이름이 비슷한 `src/lib/speakerMapping.ts`는 **살아 있다**(`page.tsx`·`notionSave.ts`가 쓴다). 지우지 않는다.

- [ ] **Step 2: 삭제한다**

```bash
git rm src/lib/speakerMerge.ts src/lib/speakerMerge.test.ts
```

- [ ] **Step 3: 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -5
```

기대: tsc 통과. 테스트 **`0 failed`**, 통과 개수가 386줄 분량만큼 줄어든다(테스트 파일이 사라졌으므로). 줄어든 것은 정상이다 — 실패가 0인지만 본다.

- [ ] **Step 4: 커밋**

```bash
git commit -m "$(cat <<'MSG'
refactor: 고아가 된 speakerMerge 삭제

speakerMerge를 쓰던 곳은 InputSection/InputTabs 하나뿐이었고, 그것이 /result와
함께 사라졌다. 610줄(구현 224 + 테스트 386).

테스트 386줄이 통과하고 있었지만, 아무도 호출하지 않는 로직을 지키는
테스트였다. 이름이 비슷한 speakerMapping은 살아 있으므로 남긴다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 고아 타입과 패키지 정리

**Files:**
- Modify: `src/types/meeting.ts` — `SavedMeetingResult` · `SavedMeetingResultV2` 정의 삭제
- Modify: `package.json` — `jspdf` · `html2canvas` 제거

**Interfaces:**
- Consumes: Task 1·2 완료 상태
- Produces: 없음

- [ ] **Step 1: 어떤 타입이 고아가 됐는지 확인한다**

```bash
cd /c/dev/autonote
for t in SavedMeetingResult SavedMeetingResultV2 Segment SpeakerMapping AnalysisResult; do
  echo "-- $t: $(grep -rl "\b$t\b" src --include=*.ts --include=*.tsx | tr '\n' ' ')"
done
```

기대:
- `SavedMeetingResult` · `SavedMeetingResultV2` → `src/types/meeting.ts` **하나만** → 삭제 대상
- `Segment` · `SpeakerMapping` → `speakerMapping.ts` 등이 아직 쓴다 → **남긴다**
- `AnalysisResult` → `page.tsx`가 쓴다 → **남긴다**

출력이 이와 다르면 실제 출력을 따른다. **`types/meeting.ts`에만 나오는 타입만** 지운다.

- [ ] **Step 2: 고아 타입을 지운다**

`src/types/meeting.ts`에서 `SavedMeetingResult`와 `SavedMeetingResultV2`의 `export type`/`export interface` 블록을 지운다. 이 둘만 쓰던 하위 타입이 함께 고아가 되면 Step 1의 명령을 다시 돌려 확인한 뒤 지운다.

- [ ] **Step 3: 패키지를 확인한다**

```bash
for p in jspdf html2canvas docx file-saver; do
  echo "-- $p: $(grep -rl "$p" src --include=*.ts --include=*.tsx | tr '\n' ' ')"
done
```

기대:
- `jspdf` · `html2canvas` → **출력 없음** → 제거 대상
- `docx` → `src/lib/exportNote.ts` (217행의 **동적 import**) → **남긴다**
- `file-saver` → `src/lib/exportNote.ts` → **남긴다**

`docx`를 정적 import로 찾으면 안 나온다. 위 명령은 문자열로 찾으므로 동적 import도 잡는다.

- [ ] **Step 4: 패키지를 제거한다**

```bash
npm uninstall jspdf html2canvas
```

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: tsc 통과 · 실패 0 · `✓ Compiled successfully`

- [ ] **Step 6: 내보내기가 여전히 되는지 확인한다** (수동)

`npm run dev` 후 노트 하나를 열고 `[내보내기]` → **Word**와 **PDF**를 각각 받아본다.

- Word는 `docx` 동적 import를 탄다 → 파일이 받아져야 한다
- PDF는 `window.open` + 인쇄를 쓴다(jspdf가 아니다) → 인쇄 창이 떠야 한다

**둘 중 하나라도 안 되면 패키지 제거를 되돌리고 보고한다.**

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
refactor: 고아 타입과 미사용 패키지 정리

SavedMeetingResult / SavedMeetingResultV2는 meetingStorage와 함께 참조자를
잃었다. Segment·SpeakerMapping·AnalysisResult는 살아있는 코드가 쓰므로 남긴다.

jspdf와 html2canvas는 /result/page.tsx에서만 쓰였다. docx는 남긴다 —
exportNote.ts가 동적 import로 쓰기 때문에 정적 참조 검색에 안 잡힌다.

Word·PDF 내보내기를 브라우저에서 직접 확인했다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: 죽은 헤더 UI 제거와 제목 입력 연결

헤더의 제목 입력칸은 `defaultValue`만 있고 `onChange`가 없어 **타이핑한 제목이 버려진다.** `[복사]`와 `[더 보기]`는 `onClick`이 없다. 빵부스러기 `전체 노트 / 오늘`은 하드코딩이다.

**Files:**
- Modify: `src/components/Layout/AppShell.tsx:156-166` (빵부스러기 + 제목 입력)
- Modify: `src/components/Layout/AppShell.tsx:195-213` (`[복사]` · `[더 보기]`)

**Interfaces:**
- Consumes: `AppShell`이 이미 받고 있는 `onUpdateNote?: (note: NoteRecord) => void` (35행) 와 `currentNote`
- Produces: 없음

- [ ] **Step 1: 빵부스러기를 지우고 제목 입력을 연결한다**

`src/components/Layout/AppShell.tsx`에서 이 블록을

```tsx
        <span className="crumb">
          <span>전체 노트</span>
          <span className="crumb-sep">/</span>
          <span>오늘</span>
        </span>
        <input
          className="title-input"
          defaultValue={currentNote?.title || "새 노트"}
          key={currentNote?.id}
        />
```

이렇게 바꾼다.

```tsx
        <input
          className="title-input"
          defaultValue={currentNote?.title || "새 노트"}
          placeholder="제목 없음"
          // key에 제목을 넣는 이유: 이 입력칸은 비제어(defaultValue)라서, 본문에서
          // 제목이 바뀌어도 스스로 다시 그리지 않는다. 제목이 바뀔 때 remount 시켜
          // 두 입력구가 서로 다른 제목을 보여주는 일을 막는다. blur 직후에만 바뀌므로
          // 타이핑 중 포커스를 잃지 않는다.
          key={`${currentNote?.id}:${currentNote?.title}`}
          onBlur={(e) => {
            const note = currentNote;
            if (!note) return;
            const next = e.currentTarget.value.trim();
            // 빈 제목으로 지워버리면 Notion 페이지 제목이 사라진다. 비우면 원래대로 둔다.
            if (!next || next === note.title) {
              e.currentTarget.value = note.title;
              return;
            }
            onUpdateNote?.({ ...note, title: next });
          }}
        />
```

- [ ] **Step 2: `[복사]`와 `[더 보기]` 버튼을 지운다**

같은 파일에서 아래 두 블록을 **통째로 삭제한다**(`[내보내기]` 버튼은 사이에 있으니 남긴다).

```tsx
          <button className="icon-btn" title="복사">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1.5" />
              <path d="M3 11V3h8" strokeLinecap="round" />
            </svg>
          </button>
```

```tsx
          <button className="icon-btn" title="더 보기">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="4" cy="8" r="1" fill="currentColor" />
              <circle cx="8" cy="8" r="1" fill="currentColor" />
              <circle cx="12" cy="8" r="1" fill="currentColor" />
            </svg>
          </button>
```

- [ ] **Step 3: 쓰이지 않게 된 CSS를 확인한다**

```bash
cd /c/dev/autonote
grep -rn "crumb" src --include=*.tsx
grep -n "crumb" src/app/globals.css
```

`.crumb` · `.crumb-sep`를 쓰는 `tsx`가 없으면 `globals.css`의 해당 규칙도 지운다.

- [ ] **Step 4: 타입 검사와 빌드**

```bash
npx tsc --noEmit && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과

- [ ] **Step 5: 브라우저에서 제목 저장을 확인한다** (수동 — 자동 테스트가 없다)

```bash
npm run dev
```

`http://localhost:3000`에서:

1. 노트를 하나 열고 **헤더 제목칸**에 `테스트 제목 A`를 입력한 뒤 다른 곳을 클릭(blur)
2. 다른 노트로 갔다가 돌아온다 → 제목이 **`테스트 제목 A`로 남아 있어야 한다**
3. 본문의 제목(큰 글씨)을 `테스트 제목 B`로 고치고 blur → **헤더도 `테스트 제목 B`로 바뀌어야 한다**
4. 헤더 제목칸을 **전부 지우고** blur → 원래 제목으로 되돌아와야 한다(빈 제목 금지)
5. 브라우저를 새로고침 → 제목이 유지되어야 한다(IndexedDB에 저장됨)

**하나라도 실패하면 고치고 다시 확인한다.** 이 Task의 수용 기준이다.

- [ ] **Step 6: dev 서버를 정리한다**

```bash
# 위 npm run dev를 Ctrl+C로 종료한다. 백그라운드로 띄웠다면 프로세스를 확인해 종료한다.
```

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
fix(ui): 헤더 제목 입력을 실제로 저장되게 하고 죽은 버튼을 없앤다

헤더 제목칸은 defaultValue만 있고 onChange가 없어 타이핑한 제목이 그대로
버려졌다. 제목 입력구가 둘(헤더·본문)인데 눈에 띄는 쪽이 죽어 있었다.

- onBlur에서 onUpdateNote로 넘긴다. 빈 제목은 거부한다 — Notion 페이지
  제목이 사라지기 때문이다
- key에 제목을 넣어, 본문에서 제목을 고쳐도 헤더가 따라오게 한다.
  비제어 입력이라 스스로 다시 그리지 않기 때문이다
- onClick이 없던 [복사]·[더 보기] 제거
- 하드코딩된 빵부스러기 "전체 노트 / 오늘" 제거

브라우저에서 5가지 시나리오를 직접 확인했다(이 저장소에 UI 테스트가 없다).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: 일어나지 않는 일을 약속하는 문구 제거

`NoteDocument`의 핵심 요약 블록은 녹음 중에 `"녹음 중 자동으로 요약됩니다..."`라고 말한다. **분석을 끈 뒤로 그런 일은 일어나지 않는다.**

**Files:**
- Modify: `src/components/NoteDoc/NoteDocument.tsx:490-493`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: 문구를 고친다**

`src/components/NoteDoc/NoteDocument.tsx`에서

```tsx
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>
                {mode === "live" ? "녹음 중 자동으로 요약됩니다..." : "요약이 없습니다."}
              </p>
```

를 이렇게 바꾼다.

```tsx
              <p style={{ color: "var(--ink-4)", fontSize: 13 }}>
                {/* 녹음이 끝나도 자동 분석은 하지 않는다. 녹음 중이든 아니든
                    [다시 정리]를 눌러야 요약이 생긴다 — 두 경우에 같은 말을 한다. */}
                아직 정리하지 않았습니다. [다시 정리]를 누르면 AI가 요약합니다.
              </p>
```

`mode`가 이 블록에서만 쓰이던 것이 아니므로 prop은 그대로 둔다. `mode`가 다른 데서도 쓰이는지 확인:

```bash
grep -n "mode" src/components/NoteDoc/NoteDocument.tsx
```

- [ ] **Step 2: 타입 검사와 빌드**

```bash
npx tsc --noEmit && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과. `mode`가 쓰이지 않게 됐다면 미사용 변수 경고가 나온다 — 그때만 prop을 정리한다.

- [ ] **Step 3: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
fix(ui): 일어나지 않는 자동 요약을 약속하지 않는다

핵심 요약 블록이 녹음 중에 "녹음 중 자동으로 요약됩니다..."라고 말했다.
분석을 끈 뒤로 그런 일은 일어나지 않는다. [다시 정리]를 눌러야 요약이
생긴다는 사실을 그대로 적는다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: `analyzing` 상태를 둘로 나눈다

`analyzing` 하나가 **서로 다른 두 가지**를 나타낸다.

| 호출 위치 | 실제 의미 |
|---|---|
| `page.tsx:602` (`analyzeFromTurns` ← `handleRegen`) | 진짜 AI 분석 |
| `page.tsx:709` (`handleTextSubmit`) | Notion 저장 진행률 |

`page.tsx:706`의 주석이 이 혼동을 이미 기록하고 있다.

**이것은 화면에 거짓이 뜨는 문제가 아니다.** 텍스트 제출 중에는 `TextInputPanel`("저장 중...")만 보이고 `AppShell`("AI 분석 중...")은 렌더되지 않기 때문이다. 코드를 읽는 사람이 속는 문제이고, 2단계에서 이 prop들을 옮길 때 잘못 옮기기 쉬운 자리다.

**Files:**
- Modify: `src/app/page.tsx:218` (상태 선언) · `:709` · `:718` (텍스트 제출 경로) · `:898` · `:936` (prop 전달)

**Interfaces:**
- Consumes: 없음
- Produces: `page.tsx`의 `savingToNotion: boolean` 상태. `AppShell`의 `analyzing` prop 이름은 **바뀌지 않는다**(진짜 분석을 뜻하게 되므로 이름이 이미 맞다)

- [ ] **Step 1: 상태를 추가한다**

`src/app/page.tsx:218` 근처:

```tsx
  const [analyzing, setAnalyzing] = useState(false);
```

아래에 한 줄 더한다.

```tsx
  // analyzing과 나누는 이유: 텍스트 제출은 AI를 부르지 않고 Notion에만 저장한다.
  // 한 변수로 둘을 나타내면 2단계에서 이 prop을 옮길 때 잘못된 문구가 따라간다.
  const [savingToNotion, setSavingToNotion] = useState(false);
```

- [ ] **Step 2: 텍스트 제출 경로를 새 상태로 바꾼다**

`handleTextSubmit`(`page.tsx:705` 근처)에서 `setAnalyzing` 두 곳을 `setSavingToNotion`으로 바꾸고, 낡은 주석을 지운다.

```tsx
    // AI 분석 없이 바로 저장한다. 분석은 "다시 정리" 버튼에서만 실행된다.
    const textTurns = parseTextToTurns(data.text);
    setSavingToNotion(true);
    try {
      await finalizeNote({
        ...note,
        segments: textTurns,
        title: data.title || note.title,
        meetingDate: data.date || note.meetingDate,
      });
    } finally {
      setSavingToNotion(false);
    }
```

`analyzeFromTurns`(`page.tsx:602`·`:610`)의 `setAnalyzing`은 **그대로 둔다.** 거기서는 진짜 AI를 부른다.

- [ ] **Step 3: prop 전달을 맞춘다**

`page.tsx:898`의 `TextInputPanel`:

```tsx
    return <TextInputPanel onSubmit={handleTextSubmit} onBack={() => setScreen("mode-select")} loading={savingToNotion} />;
```

`page.tsx:936`의 `AppShell`은 `analyzing={analyzing}` **그대로 둔다.**

- [ ] **Step 4: 남은 참조가 없는지 확인한다**

```bash
cd /c/dev/autonote
grep -n "analyzing\|savingToNotion" src/app/page.tsx
```

기대: `analyzing`은 선언 · `analyzeFromTurns`의 두 곳 · `AppShell` prop에만 남는다.

- [ ] **Step 5: 타입 검사 · 테스트 · 빌드**

```bash
npx tsc --noEmit && npx vitest run 2>&1 | tail -3 && npm run build 2>&1 | grep -E "✓ Compiled|error"
```

기대: 통과 · 실패 0 · `✓ Compiled successfully`

- [ ] **Step 6: 텍스트 입력 경로를 브라우저에서 확인한다** (수동)

```bash
npm run dev
```

`새 노트` → `텍스트 입력` → 아무 내용이나 넣고 `노트 만들기`.

- 저장되는 동안 버튼이 **`저장 중...`**으로 바뀌고 비활성화되어야 한다(`AI 분석 중`이 아니다)
- 저장이 끝나면 노트 화면으로 넘어가야 한다

확인 후 dev 서버를 종료한다.

- [ ] **Step 7: 커밋**

```bash
git add -A
git commit -m "$(cat <<'MSG'
refactor: analyzing이 나타내던 두 가지를 나눈다

analyzing 하나가 진짜 AI 분석(analyzeFromTurns)과 Notion 저장 진행률
(handleTextSubmit) 둘 다를 나타내고 있었다. page.tsx:706의 주석이 그 혼동을
이미 기록하고 있었다.

화면에 거짓이 뜨지는 않았다 — 텍스트 제출 중에는 TextInputPanel만 보이고
AppShell은 렌더되지 않는다. 다만 2단계에서 이 prop을 옮길 때 잘못된 문구가
따라가기 쉬운 자리라 지금 나눈다.

savingToNotion을 새로 만들어 텍스트 제출 경로에 쓴다. AppShell의 analyzing은
이제 진짜 분석만 뜻하므로 이름을 그대로 둔다.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
MSG
)"
```

---

### Task 8: 마무리 — 전체 검증과 PR

**Files:** `README.md` (필요 시)

**Interfaces:**
- Consumes: Task 1~7
- Produces: PR

- [ ] **Step 1: 전체 검증을 한 번에 돌린다**

```bash
cd /c/dev/autonote
npx tsc --noEmit && npx vitest run 2>&1 | tail -5 && npm run build 2>&1 | tail -20
```

기대: tsc 통과 · **실패 0** · `✓ Compiled successfully` · 라우트 목록에 `/result` 없음

- [ ] **Step 2: 지운 줄 수를 센다**

```bash
git diff --stat main..HEAD | tail -3
```

계획한 삭제량은 4,223줄이다(3,613 + speakerMerge 610). 크게 다르면 이유를 PR에 적는다.

- [ ] **Step 3: README에 죽은 설명이 남았는지 확인한다**

```bash
grep -n "result\|분석" README.md | head -20
```

`/result` 화면이나 사라진 기능을 설명하는 문장이 있으면 고친다. 없으면 그대로 둔다.

- [ ] **Step 4: 브라우저에서 주요 흐름을 한 번 통과시킨다** (수동)

```bash
npm run dev
```

1. `새 노트` → `실시간 녹음` → 녹음 시작·중지 → 저장 배너가 뜨는지
2. `이어 녹음` → 중지 → 같은 Notion 페이지에 붙는지(Notion 설정이 되어 있다면)
3. 제목 수정이 저장되는지
4. `[내보내기]` → Word·PDF
5. 설정 모달이 열리는지(`ApiKeyModal`)

**콘솔에 에러가 뜨면 기록해 PR에 적는다.**

확인 후 dev 서버를 종료한다.

- [ ] **Step 5: 푸시하고 PR을 만든다**

```bash
git push -u origin feat/ui-step1-cleanup
```

PR 본문에 반드시 담을 것:

- 지운 줄 수와 묶음별 내역
- **`meetingStorage` 테스트가 사라진 것은 고친 것이 아니라 지운 것**이라는 사실
- **localStorage `last_meeting_result` 키를 방치**한다는 사실
- 도달 불가 판정이 `grep` 기반이라 **문자열 동적 참조는 못 잡는다**는 한계
- **UI 테스트가 0개**라 Task 5·7의 검증이 수동이었다는 사실과, 실제로 확인한 시나리오 목록
- 2단계에서 할 일(레이아웃 재편)은 이 PR에 없다는 것

---

## 실행 중 멈춰야 하는 신호

아래는 "고치고 계속"이 아니라 **멈추고 보고**다. 도달 불가 판정이 틀렸다는 뜻이고, 되살리는 판단은 사람이 해야 한다.

| 신호 | 뜻 |
|---|---|
| Task 1 Step 1에서 `/result` 참조가 나옴 | 라우트가 도달 가능하다 |
| 삭제 후 `tsc`가 에러를 냄 | 살아있는 코드가 지운 파일을 쓰고 있었다 |
| 테스트 **통과** 개수가 예상보다 많이 줄어듦 | 지운 파일에 살아있는 테스트가 딸려 있었다 |
| Task 4 Step 6에서 Word/PDF 내보내기 실패 | 패키지 판정이 틀렸다 |
| Task 5 Step 5의 5가지 중 하나라도 실패 | 제목 연결이 잘못됐다 — 고치고 다시 확인 |
