# design-sync 메모 (autonote)

## 이 저장소는 디자인 시스템 패키지가 아니다

autonote는 `private: true` Next.js **앱**이다. `main`/`module`/`exports`/`files`가 없고,
컴포넌트 라이브러리 빌드도 `dist/`도 `.d.ts`도 없다. 변환기의 package shape를 억지로
태우고 있는 것이므로, 아래 우회 세 가지가 **전부 필요하다.** 하나라도 빠지면 빌드가
조용히 잘못된 결과를 낸다.

- **`.ds-pkg/` 스테이징 디렉터리 + `node_modules/autonote` 정션.**
  npm은 자기 자신을 설치하지 않아 `node_modules/autonote`가 없고, 없으면
  `exportedNames()`가 ENOENT로 죽는다.
  처음에 `node_modules/autonote` → 저장소 루트로 바로 걸었더니 **무한 재귀**가 생겨
  (`node_modules/autonote/node_modules/autonote/...`) ts-morph가 영원히 돌았다.
  그래서 `node_modules`가 없는 `.ds-pkg/`를 만들어 거기에 건다.

  ```bash
  rm -rf .ds-pkg && mkdir -p .ds-pkg
  cp package.json tsconfig.json .ds-pkg/
  cp src/app/globals.css .ds-pkg/globals.css        # cssEntry용 (아래 참고)
  cmd //c "mklink /J .ds-pkg\src C:\dev\autonote\src"
  cmd //c "mklink /J node_modules\autonote C:\dev\autonote\.ds-pkg"
  ```

- **`globals.css`는 `.ds-pkg/`로 복사해야 한다.** `cssEntry`를 `src/app/globals.css`로
  두면 `src`가 정션이라 실경로가 패키지 밖으로 나가 `resolves outside the package —
  skipped`로 건너뛴다. **재동기화 때 이 복사본을 반드시 다시 떠야 한다** — 안 그러면
  낡은 토큰이 올라간다.

- **`ds-entry.ts` 배럴은 직접 만든 것이다.** autonote 컴포넌트는 전부
  `export default function`인데 변환기의 합성 진입점은 `export * from`을 쓴다.
  `export *`는 default를 재수출하지 않아 번들이 17KB로 비고 `window.Autonote`가
  텅 빈다. 배럴이 default를 이름 있는 export로 바꿔 준다.
  **컴포넌트를 추가·삭제·이동하면 배럴과 `cfg.componentSrcMap`을 함께 고쳐야 한다.**

  ```bash
  # 배럴은 src/components/**/*.tsx 의 `export default function <Name>` 에서 생성했다
  ```

## 빌드 명령

```bash
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./.ds-pkg/ds-entry.ts --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

`package-validate`는 playwright를 `.ds-sync/`에 설치해야 렌더 체크가 돈다
(`cd .ds-sync && npm i playwright && npx playwright install chromium`).
설치 전에는 `[RENDER_SKIPPED]`로 하드 실패한다.

## 남겨둔 경고 두 가지

- **`[FONT_MISSING]`** — Pretendard / Apple SD Gothic Neo / JetBrains Mono. autonote는
  이 폰트들을 *선호*만 하고 시스템 폰트로 폴백한다. 번들에 실을 폰트 파일이 애초에
  없으므로 `cfg.extraFonts`로 고칠 수 있는 성격이 아니다. `runtimeFontPrefixes`로
  침묵시킬 수도 있지만 그건 "호스트가 런타임에 서빙한다"는 뜻이라 사실과 다르다.
  **경고를 그대로 두는 쪽이 정직하다.**
- **`[RENDER_ERRORS]` NotionStatusPanel (2건, in-cell caught)** — 스크린샷으로 7개 셀이
  전부 정확히 렌더되는 것을 확인했다. 화면에 드러나지 않는 콘솔 에러이고 원인은
  규명하지 못했다. **원인 미상인 채로 남아 있다.**

## 컴포넌트에 대한 발견

- `NotionStatusPanel`의 `PageRecreated` 상태에서 건너뛴 속성이 **두 번** 나온다 —
  배너 문구(`건너뛴 속성: 소요시간`)와 그 아래 `<ul className="n-skipped">` 목록.
  앱 자체의 중복이지 동기화 결함이 아니다. 앱 쪽에서 고칠 만하다.
- 7개는 기본 카드(floor card)로 나간다: AnalysisView · ApiKeyModal · AppShell ·
  ModelLoadingOverlay · ExportModal · LiveTranscript · NotionConnectionPanel.
  실패가 아니라 프리뷰 미작성이며, 컴포넌트는 전부 정상 import된다.

## 재동기화 위험 (다음 실행이 지켜봐야 할 것)

- **`.ds-pkg/globals.css`가 낡는다.** 앱의 `src/app/globals.css`를 고쳐도 자동으로
  따라오지 않는다. 빌드 전에 반드시 다시 복사한다.
- **`ds-entry.ts`가 낡는다.** 컴포넌트를 추가해도 배럴에 없으면 동기화되지 않고,
  삭제한 컴포넌트가 남아 있으면 빌드가 깨진다.
- **`cfg.componentSrcMap`이 18개를 전부 열거한다.** `dist`가 없어 `.d.ts` 자동 발견이
  0개이기 때문이다. 원래 "sparse여야 한다"는 규약과 어긋나지만, 이 저장소에서는
  이것 말고 컴포넌트를 인식시킬 방법이 없다. 컴포넌트가 바뀔 때마다 손으로 고쳐야 한다.
- **`.d.ts` 계약이 약하다.** 빌드된 패키지가 아니라 소스에서 추출한 것이라
  (`[DTS] parsed 0 .d.ts files`), 상속된 props나 복잡한 제네릭이 빠져 있을 수 있다.
  디자인 에이전트가 API를 오해할 여지가 여기에 있다. 라이브러리 빌드를 추가하면 해결된다.
- **프리뷰 5개가 도메인 타입 픽스처를 인라인으로 들고 있다** (`NoteRecord`,
  `NotionSaveState` 등). 타입이 바뀌면 프리뷰가 조용히 낡는다 — 컴파일은 되지만
  화면이 실제와 달라진다.
- **폰트 워크플로우가 검증된 적 없다.** 브랜드 폰트를 실제로 싣기로 하면
  `cfg.extraFonts` 경로는 이 저장소에서 한 번도 돌아본 적이 없다.
