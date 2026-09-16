## How to build with Autonote

Autonote is a Korean meeting-notes app: it records a meeting, transcribes it with speaker
diarization, and saves the transcript straight to a Notion page. Its look is quiet and
document-like — near-white surfaces, one near-black accent, thin borders, no drop shadows
in normal chrome. Colour is reserved for two things: **who is speaking** and **whether the
meeting reached Notion**.

### No provider, no theme setup

Components render correctly with nothing wrapped around them. There is no context provider,
no theme object, no `ThemeProvider` — all styling comes from CSS custom properties defined on
`:root` in the shipped stylesheet. Import the stylesheet and the components are styled.

```jsx
import { SpeakerBubble, NotionStatusPanel } from 'autonote'

<div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 520 }}>
  <SpeakerBubble
    turn={{ id: 1, sp: 1, t: '0:03', text: '3분기 목표부터 확인하겠습니다.' }}
    participants={[{ sp: 1, name: '김지훈', role: 'PM', initials: '김' }]}
    onSpeakerName={() => {}}
    onEditTurn={() => {}}
    onSplitTurn={() => {}}
  />
</div>
```

### The styling idiom: CSS custom properties, not utility classes

There is **no utility-class system here** — no Tailwind, no spacing scale, no `bg-*`/`text-*`
families. Do not invent one. For your own layout glue, write plain CSS (or inline styles) and
reach for the design system through `var(--token)`. These are the complete token families:

| Family | Tokens | Use |
|---|---|---|
| Surfaces | `--bg` `--surface` `--surface-2` `--surface-3` | page ground, cards, rails, pressed fills |
| Text | `--ink` `--ink-2` `--ink-3` `--ink-4` `--ink-5` | darkest to lightest; `--ink-4` is placeholder text |
| Lines | `--border` `--border-strong` `--divider` | hairlines; `--divider` is the faintest |
| Interaction | `--hover` `--active` `--accent` `--accent-soft` | translucent overlays; `--accent` is near-black |
| Speaker | `--sp1`..`--sp4` and `--sp1-soft`..`--sp4-soft` | indigo / teal / amber / pink, one per speaker |
| Recording | `--rec` `--rec-soft` | the red used only while recording |
| Semantic | `--info` `--warn` | informational and cautionary text |
| Radius | `--r-sm` `--r-md` `--r-lg` `--r-xl` | 6 / 8 / 12 / 16px |
| Shadow | `--shadow-1` `--shadow-2` `--shadow-3` | modals and overlays only |
| Type | `--font-sans` `--font-mono` | the sans stack leads with Pretendard and falls back to system Korean faces |

**Speaker colour is the system's signature.** A speaker's number (`turn.sp`, 1-based) picks its
family, cycling every four. Use `--spN` for the name and `--spN-soft` for any fill behind it.
Never hard-code a speaker colour.

Two element classes are worth reusing directly because every control in the app uses them:
`btn` (with `btn-primary` for the one emphasised action) and `icon-btn` for square icon-only
buttons. Everything else in the stylesheet is component-internal — read it, don't reapply it.

### Where the truth lives

- `styles.css` and the files it `@import`s — the complete token and class vocabulary. Read it
  before styling anything; it is the authority, not this summary.
- `components/<group>/<Name>/<Name>.d.ts` — the exact props of each component.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage.

### What these components are, and are not

This library came out of a working application, not a general-purpose kit. Several components
take Autonote's own domain shapes — `NoteRecord`, `TurnSegment`, `Participant`,
`NotionSaveState` — and are only composable if you supply those shapes. `AppShell` in
particular is the whole application chrome and expects roughly thirty props; it is included for
completeness, not as a layout primitive.

The ones that travel well: `SpeakerBubble`, `RecordingBar`, `ActionBar`, `NoteList`,
`NotionStatusPanel`, `MeetingInfoPanel`. Build with those and with the tokens.
