# Notion 연결 테스트와 속성 매핑 UI 설계 스펙 (Phase B)

- **작성일**: 2026-09-15
- **대상 프로젝트**: autonote (WOOK'S 회의록)
- **요청자**: 노진욱
- **상태**: 사용자 검토 대기
- **선행 작업**: `2026-09-15-notion-direct-save-design.md` (병합됨, PR #1) / Phase A (`44ae761`, 같은 브랜치)

---

## 1. 배경 및 목표

### 문제

회의 종료 시 Notion DB에 페이지를 만들면서 속성 이름을 **코드에 하드코딩된 값으로 찾는다**: `회의일시`, `참석자`, `소요시간`, `상태`, `입력방식`. 이름이 한 글자만 달라도 조용히 건너뛴다.

실제로 겪은 사고: 대상 DB의 날짜 속성 이름이 `회의일자`인데 앱은 `회의일시`를 찾아 **날짜가 계속 비어 있었다.** 사용자는 왜 비는지 알 방법이 없었다.

부수적으로, 저장이 실패할 때 원인을 **저장 시점에야** 알게 된다. 설정 화면에서 미리 확인할 방법이 없다.

### Phase A에서 이미 해결된 것 (이 스펙의 범위 밖)

같은 브랜치의 선행 커밋 `44ae761`이 처리했다. 여기서 반복하지 않는다.

- 입력값이 data source ID여도 저장되는 폴백
- 401/403·400·404 상태 코드별 오류 안내
- `상태`가 status 타입일 때 기존 옵션과 대조해 설정
- append 요청 간 350ms 간격
- `Notion-Version` 2025-09-03 명시 고정

### 목표

1. 설정 화면에서 **저장 전에** 연결을 확인하고 DB 제목과 속성 목록을 본다.
2. 앱의 각 필드를 **어느 Notion 속성에 넣을지 사용자가 고른다.** 이름이 달라도 동작한다.
3. `상태`·`입력방식`은 **옵션 값까지** 고른다. status 타입은 API로 옵션을 만들 수 없으므로, 옵션을 고르게 하지 않으면 매핑해도 값이 안 들어간다.
4. 매핑을 설정하지 않은 기존 사용자는 **지금과 똑같이** 동작한다.

### 비목표 (YAGNI)

- **타입 강제 변환** — 날짜를 텍스트 속성에 넣는 식은 지원하지 않는다. 드롭다운이 타입 호환 속성만 보여주므로 사용자가 그 상태를 만들 수 없다.
- **DB별 매핑 여러 벌 보관** — 한 벌만 두고 소속 data source를 함께 기록한다.
- **해석 결과 캐싱** — 연결 테스트가 `dataSourceId`를 저장하므로 자연히 따라오지만, 저장 경로의 조회 생략까지는 이번 범위가 아니다.
- **멱등성** — Phase C.
- **제목 속성 매핑** — 제목은 이름이 아니라 `title` 타입으로 찾고 모든 DB에 정확히 하나 있다.

---

## 2. 아키텍처 개요

### 핵심 원칙

**문구는 한 곳에서 만든다.** 연결 테스트와 저장이 같은 해석 로직과 같은 오류 문구를 쓴다. 각자 만들면 두 경로의 안내가 갈라진다.

### 전체 흐름

```
[설정 화면 · NotionConnectionPanel]
  토큰 + DB ID 입력 → [연결 테스트]
      ↓
  POST /api/notion/schema  (헤더: x-notion-token, x-notion-db)
      ↓ resolveDataSource()        ← 저장 경로와 공유
      ↓ listProperties(schema)     ← 순수 함수
  { dataSourceId, dataSourceName, properties: [{name, type, options?}] }
      ↓
  매핑 드롭다운 5줄 → 모달의 [저장]이 자격증명과 함께 localStorage에 기록

[회의 종료]
  pushToNotion(note)
      ↓ body: { meeting, mapping }
  POST /api/notion
      ↓ resolveDataSource()        ← 같은 함수
      ↓ mapping.dataSourceId === 해석된 ID 인가?
         예  → filterProperties(schema, meeting, mapping.fields)
         아니오 → filterProperties(schema, meeting, null) + mappingIgnored: true
      ↓
  배너에 채워진 속성 / 건너뛴 속성 / 매핑 무시 안내
```

### 파일 변경 범위

| 파일 | 변경 | 설명 |
|------|------|------|
| `src/lib/notionErrors.ts` | 신규 | 순수 함수. `stageForStatus`, `lookupErrorMessage` |
| `src/lib/notionErrors.test.ts` | 신규 | 위 단위 테스트 |
| `src/lib/notionResolve.ts` | 신규 | 서버 전용. `resolveDataSource` |
| `src/app/api/notion/schema/route.ts` | 신규 | 연결 테스트 엔드포인트 |
| `src/components/Settings/NotionConnectionPanel.tsx` | 신규 | 토큰·DB ID·테스트·매핑 UI |
| `src/lib/notionBlocks.ts` | 수정 | `listProperties`, `filterProperties` 3번째 인자, 스키마 타입 확장 |
| `src/lib/notionBlocks.test.ts` | 수정 | 위 케이스 추가 |
| `src/types/meeting.ts` | 수정 | 매핑 타입, `mappingIgnored` |
| `src/lib/apiKey.ts` | 수정 | 매핑 getter/setter |
| `src/lib/notionSave.ts` | 수정 | 본문을 `{ meeting, mapping }`으로 |
| `src/app/api/notion/route.ts` | 수정 | 해석 로직 추출, 매핑 적용 |
| `src/components/Layout/ApiKeyModal.tsx` | 수정 | Notion 섹션을 패널로 교체, 안내 문구 정정 |
| `src/components/Layout/AppShell.tsx` | 수정 | `mappingIgnored` 배너 |
| `src/app/page.tsx` | 수정 | 매핑을 `pushToNotion`에 전달 |
| `README.md` | 수정 | status 관련 안내 정정 |

---

## 3. 데이터 모델

```ts
/** 매핑 가능한 앱 필드. 제목은 title 타입으로 찾으므로 제외한다. */
export type NotionFieldKey = "meetingDate" | "attendees" | "durationText" | "status" | "entryMethod";

export type NotionFieldMapping = {
  /** 넣을 Notion 속성 이름. null이면 이 필드를 일부러 쓰지 않는다. */
  property: string | null;
  /** select·status 속성일 때 넣을 옵션 이름. 값 속성에서는 쓰지 않는다. */
  option?: string | null;
};

export type NotionMappingConfig = {
  /** 이 매핑을 만들 때의 data source. 저장 시 해석 결과와 다르면 통째로 무시한다. */
  dataSourceId: string;
  /** 사용자가 마지막으로 본 DB 제목. 설정 화면 표시용. */
  dataSourceName: string;
  fields: Partial<Record<NotionFieldKey, NotionFieldMapping>>;
};
```

### 세 가지 상태를 구분한다

`fields`가 `Partial`인 것과 `property: null`이 **서로 다른 뜻**이다. 이 구분이 배너의 "건너뛴 속성" 목록을 쓸모 있게 만든다.

| `fields[key]` | 뜻 | `skipped`에 들어가나 |
|---|---|---|
| 키 없음 | 설정 안 함 → 하드코딩 이름으로 추정 (기존 동작) | 못 찾으면 들어감 |
| `{ property: null }` | **일부러 안 씀** | **안 들어감** |
| `{ property: "회의일자" }` | 그 속성에 넣음 | 타입 불일치면 들어감 |

드롭다운의 `(사용 안 함)`이 두 번째다. "소요시간은 우리 DB에 필요 없다"를 표현할 수 있어야, 배너에 **진짜 문제만** 남는다.

### 저장

```
localStorage["autonote_notion_mapping"] = JSON.stringify(NotionMappingConfig)
```

`apiKey.ts`의 기존 패턴을 따른다: `typeof window` 가드, 빈 값이면 `removeItem`. **파싱에 실패하면 `null`을 돌려주고 조용히 이름 추정으로 돌아간다** — 손상된 설정 하나 때문에 회의 저장이 막히면 안 된다.

### 응답 타입 확장

`NotionSaveResponse`의 성공 변형과 `NotionSaveState`의 `saved`에 같은 선택 필드를 더한다.

```ts
      /** 매핑이 다른 data source의 것이라 무시됐는가. */
      mappingIgnored?: boolean;
```

선택 필드라 기존 소비처는 그대로 컴파일된다.

---

## 4. 서버

### 4.1 `src/lib/notionErrors.ts` (순수)

```ts
export function stageForStatus(status: number): "auth" | "schema";
export function lookupErrorMessage(status: number, detail: string): string;
```

Phase A가 `route.ts`에 인라인으로 넣은 문구 선택 로직을 옮긴다. SDK를 import하지 않으므로 테스트가 가볍고, **지금 없는 401/400/404 분기 테스트가 생긴다.**

| status | stage | 문구 요지 |
|---|---|---|
| 401, 403 | `auth` | 토큰이 유효하지 않음. 설정에서 Internal Integration Token 확인 |
| 400 | `schema` | ID 형식 오류 또는 데이터 소스 불일치 |
| 그 외(404 포함) | `schema` | DB를 찾을 수 없음. ID 확인 + **우측 상단 ⋯ → 연결로 통합 초대** |

### 4.2 `src/lib/notionResolve.ts` (서버 전용)

```ts
export type ResolveResult =
  | { ok: true; dataSourceId: string; dataSourceName: string; schema: NotionPropertySchema | null }
  | { ok: false; status: number; stage: "auth" | "schema"; error: string };

export async function resolveDataSource(notion: Client, inputId: string): Promise<ResolveResult>;
```

Phase A의 폴백을 그대로 옮긴다.

1. `databases.retrieve(inputId)` → 성공하면 `data_sources[0]`
2. 401/403이면 **폴백하지 않고 즉시 반환** — 토큰이 틀렸으면 데이터 소스로 시도해도 같은 이유로 실패하고, 폴백 실패가 진짜 원인을 가린다
3. 그 외 실패면 `dataSources.retrieve(inputId)` 재시도 → 성공하면 입력값이 data source ID였던 것이고, **`schema`를 그 응답에서 바로 얻어** 2차 조회를 건너뛴다
4. 둘 다 실패하면 **1번의 오류**를 반환한다 (사용자에게 더 유용하다)

`schema`가 `null`이면 호출자가 `dataSources.retrieve`로 따로 가져온다.

**이 함수에는 단위 테스트를 붙이지 않는다.** 이 저장소에 목킹 패턴이 없고, 만들면 Notion의 실제 응답이 아니라 목 객체를 검증하게 된다. 대신 두 라우트가 같은 코드를 쓰므로 실호출 한 번이 양쪽을 검증한다.

### 4.3 `POST /api/notion/schema`

```
헤더: x-notion-token, x-notion-db
본문: 없음

→ 200 { ok: true, dataSourceId, dataSourceName, properties: NotionPropertyInfo[] }
→ 4xx { ok: false, stage, error }
```

**의미상 GET이 맞지만 POST로 둔다.** 자격증명이 헤더에 실리는데 GET은 중간 캐시나 프록시 로그에 남을 여지가 더 크다. 읽기 전용이라는 것은 경로 이름으로 드러난다.

```ts
export type NotionPropertyInfo = {
  name: string;
  type: string;
  /** select·status일 때만. 드롭다운에 채울 옵션 이름. */
  options?: string[];
};
```

### 4.4 `listProperties` (순수)

`notionBlocks.ts`에 둔다. 스키마를 UI가 쓸 목록으로 바꾼다. select·status면 `options`를 채우고, 나머지 타입은 `options`를 아예 넣지 않는다.

이를 위해 `NotionPropertySchema`에 `select`를 더한다 (Phase A에서 `status`만 추가했다):

```ts
export type NotionPropertySchema = Record<string, {
  type: string;
  select?: { options?: Array<{ name: string }> };
  status?: { options?: Array<{ name: string }> };
}>;
```

### 4.5 요청 본문 구조 변경

지금 `/api/notion`의 본문은 `NotionMeetingPayload` 그 자체다. 매핑은 회의 데이터가 아니라 설정이므로 섞지 않고 나란히 둔다.

```ts
// 변경 전: body = NotionMeetingPayload
// 변경 후:
{ meeting: NotionMeetingPayload, mapping?: NotionMappingConfig | null }
```

`notionSave.ts`의 `pushToNotion`과 라우트를 같이 고친다.

### 4.6 `filterProperties` 계약

```ts
filterProperties(
  schema: NotionPropertySchema,
  payload: NotionMeetingPayload,
  fields?: Partial<Record<NotionFieldKey, NotionFieldMapping>> | null,
): { properties: Record<string, unknown>; skipped: string[] };
```

3번째 인자를 넘기지 않으면 `undefined`라 **기존 호출과 기존 테스트 31개가 그대로 통과한다.**

필드별 동작은 §3의 표와 같다. 매핑된 속성의 타입이 안 맞으면 `skipped`에 이유를 붙인다: `회의일시(→회의일자: date 아님)`.

선택형 필드는 Phase A의 `resolveChoice`를 그대로 쓰되, 넣을 옵션 이름을 `fields[key].option`에서 가져온다. `option`이 없거나 `null`이면 **지금의 기본값**으로 떨어진다 — `상태`는 `"분석대기"`, `입력방식`은 `payload.entryMethod`.

이 폴백이 status 속성에서 실패하는 것은 **의도된 동작**이다. 사용자가 속성만 고르고 옵션을 고르지 않았는데 그 DB에 `분석대기` 옵션이 없으면, `상태(status 옵션 "분석대기" 없음)`으로 `skipped`에 남아 무엇을 더 골라야 하는지 알려준다. 조용히 아무 옵션이나 고르는 것보다 낫다.

### 4.7 매핑 적용 판단은 라우트가

해석된 `dataSourceId`를 아는 쪽이 라우트다.

```
mapping이 있고 mapping.dataSourceId === resolved.dataSourceId
  → filterProperties(schema, meeting, mapping.fields)
아니면
  → filterProperties(schema, meeting, null), 응답에 mappingIgnored: true
```

---

## 5. 설정 UI

### 5.1 컴포넌트 분리

`ApiKeyModal.tsx`는 이미 420줄이 넘고 STT 프로바이더·폴더 선택·요금 대시보드·Notion 자격증명을 모두 담고 있다. 여기에 연결 테스트와 드롭다운 5쌍을 더하면 다루기 어려워진다.

Notion 부분을 **토큰·DB ID 입력란까지 통째로** `NotionConnectionPanel.tsx`로 옮기고, 모달은 값만 넘긴다.

```tsx
<NotionConnectionPanel
  token={notionToken}
  databaseId={notionDbId}
  onTokenChange={setNotionTokenState}
  onDatabaseIdChange={setNotionDbIdState}
/>
```

**값을 props로 올리는 이유:** 연결 테스트는 *지금 입력란에 타이핑된* 토큰으로 해야 한다. 모달의 저장 버튼을 누르기 전 값이므로, 패널이 localStorage에서 읽으면 예전 값으로 테스트하게 된다.

### 5.2 저장 주체

**모달의 [저장] 하나가 자격증명과 매핑을 함께 저장한다.** 패널에는 저장 버튼을 두지 않는다.

패널은 매핑 상태를 위로 올려보내고 저장은 모달이 한다.

```tsx
<NotionConnectionPanel
  token={notionToken}
  databaseId={notionDbId}
  mapping={notionMapping}
  onTokenChange={setNotionTokenState}
  onDatabaseIdChange={setNotionDbIdState}
  onMappingChange={setNotionMappingState}
/>
```

패널에 남는 버튼은 **[연결 테스트] 하나뿐**이다. 조회이지 저장이 아니므로 라벨 그대로 읽히고, 저장 버튼과 헷갈릴 여지가 없다.

**[취소]의 의미가 일관돼진다.** 저장 버튼이 둘이면 취소했을 때 "매핑은 이미 저장됐고 자격증명만 버려지는" 반쪽 상태가 생긴다. 하나로 합치면 취소는 이 모달에서 만진 전부를 버린다.

연결 테스트를 하지 않고 저장해도 문제되지 않는다. 테스트 전에는 드롭다운이 뜨지 않으므로 매핑 상태가 바뀔 수 없고, localStorage에 있던 값이 그대로 다시 쓰일 뿐이다.

### 5.3 화면

```
[토큰 입력]  [DB ID 또는 URL 입력]
[연결 테스트]

  ├ 확인 중 → 버튼 비활성 + "확인 중…"
  ├ 실패   → stage별 문구를 라우트가 준 그대로
  └ 성공   → ✓ 회의록 DB · 속성 7개
            ─────────────────────────────
            회의일시   [회의일자 ▾]
            참석자     [(자동) ▾]
            소요시간   [(사용 안 함) ▾]
            상태       [진행 ▾]  옵션 [대기 ▾]
            입력방식   [(자동) ▾]

─────────────────────────────────────────
                            [취소]  [저장]   ← 모달 하단. 자격증명과 매핑을 함께 저장
```

### 5.4 드롭다운 구성

선택지는 `(자동)`, `(사용 안 함)`, 그리고 **타입이 호환되는 속성만**이다.

| 앱 필드 | 허용 타입 |
|---|---|
| 회의일시 | `date` |
| 참석자 · 소요시간 | `rich_text` |
| 상태 · 입력방식 | `select`, `status` |

호환되지 않는 속성을 보여주지 않으므로 §4.6의 "타입 불일치 → skipped" 경로는 **방어선으로만** 남는다. 사용자가 UI로 그 상태를 만들 수 없다.

`상태`·`입력방식`은 속성을 고르면 **그 속성의 옵션 드롭다운**이 옆에 나타난다. 옵션은 연결 테스트가 가져온 `NotionPropertyInfo.options`에서 온다. select는 자유 입력을 허용해도 Notion이 옵션을 만들어 주지만, **status와 동작이 갈리면 헷갈리므로 양쪽 다 목록에서 고르게 한다.**

### 5.5 기존 매핑 불러오기

패널이 열릴 때 저장된 매핑을 읽는다. 연결 테스트가 끝나면:

- 저장된 `dataSourceId`가 결과와 **같으면** → 드롭다운 초깃값으로 복원
- **다르면** → `다른 데이터베이스의 매핑입니다. 다시 설정해 주세요.` 안내 후 `(자동)`으로 초기화

### 5.6 안내 문구 정정

PR #1이 넣은 모달 안내에 이 문장이 있다.

> `상태`는 반드시 **선택(Select)** 으로 만들어야 합니다.

**Phase A에서 status 타입을 지원하면서 사실이 아니게 되었다.** status 속성도 기존 옵션과 이름이 일치하면 값이 들어간다. `README.md`에도 같은 문장이 있어 함께 고친다. 고치지 않으면 코드와 문서가 어긋난 채로 남는다.

---

## 6. 에러 처리

패널은 라우트가 준 `stage`와 문구를 **그대로** 보여준다. UI에서 문구를 다시 만들면 저장 경로와 테스트 경로의 안내가 갈라진다.

| 상황 | 표시 |
|---|---|
| 토큰·DB ID 미입력 | 버튼 비활성 |
| 401/403 | 토큰 확인 안내 |
| 400 | ID 형식·데이터 소스 불일치 |
| 404 | 초대 안내 (`⋯ → 연결`) |
| 네트워크 실패 | `서버에 연결할 수 없습니다` |

매핑이 무시됐을 때는 `saved` 배너에 덧붙인다.

> 저장 완료 · Notion에 기록됨 — **매핑이 다른 데이터베이스의 것이라 무시했습니다. 설정에서 다시 연결 테스트를 해주세요.**

조용히 무시하면 사용자는 매핑이 왜 안 먹는지 알 방법이 없다.

---

## 7. 테스트

### 단위 테스트 (vitest)

| 대상 | 케이스 |
|---|---|
| `stageForStatus` / `lookupErrorMessage` | 401·403 → auth / 400 → 형식 안내 / 404 → 초대 안내 / 500 → 초대 안내 / detail이 문구에 포함되는지 |
| `listProperties` | select 옵션 추출 / status 옵션 추출 / date·rich_text는 `options` 미포함 / 빈 스키마 → 빈 배열 / 이름 보존 |
| `filterProperties(…, fields)` | `fields` 미전달 시 기존 31개 통과 / 키 없음 → 기존 동작 / `property: null` → 채우지 않고 skipped에도 없음 / 매핑된 이름으로 채움 / 매핑 대상 속성이 없음 → skipped / 타입 불일치 → 이유 포함 skipped / 선택형에 option 지정 / status 옵션 불일치 |
| `getNotionMapping` / `setNotionMapping` | 왕복 / 손상된 JSON → `null` / 값 없음 → `null` / 빈 값 저장 시 removeItem |

### 자동 테스트가 닿지 않는 것

`resolveDataSource`, 두 라우트, `NotionConnectionPanel`에는 단위 테스트를 붙이지 않는다(§4.2의 이유). **아래는 실제 Notion 계정으로 확인해야 한다.**

1. 연결 테스트 성공 → DB 제목과 속성 개수가 맞는지
2. 토큰을 틀리게 → 401 문구
3. 통합을 초대하지 않은 DB → 404 초대 안내
4. **data source ID를 붙여넣기** → 폴백 동작 (Phase A 검증 겸함)
5. **날짜 속성이 `회의일자`인 DB에 매핑 → 실제로 날짜가 채워지는지** (겪은 사고의 해결 확인)
6. `상태`를 status 타입으로 두고 기존 옵션에 매핑 → 값이 들어가는지 (Phase A 검증 겸함)
7. 어떤 필드를 `(사용 안 함)`으로 → 배너의 "건너뛴 속성"에 안 나오는지
8. DB ID를 다른 것으로 바꾸고 저장 → 매핑 무시 안내가 뜨는지

---

## 8. 후속 과제 (이 스펙 범위 밖)

- **Phase C 멱등성** — `소스ID` 속성 + 저장 전 조회 + update/create. 재전송이 Claude의 편집을 덮어쓸 수 있어 충돌 규칙부터 정해야 한다.
- 저장 경로의 해석 결과 캐싱 — 연결 테스트가 `dataSourceId`를 이미 저장하므로 이를 저장 요청에 실어 조회를 건너뛸 수 있다.
- `meetingStorage.test.ts`의 기존 실패 테스트(`main`에서도 실패).
