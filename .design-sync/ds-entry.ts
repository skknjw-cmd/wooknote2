// design-sync 전용 배럴. 앱 컴포넌트가 전부 `export default`라서
// 변환기의 `export * from` 합성 진입점으로는 아무것도 잡히지 않는다.
// 여기서 default를 이름 있는 export로 바꿔 window.Autonote에 실리게 한다.

export { default as AnalysisView } from './src/components/Analysis/AnalysisView.tsx';
export { default as ActionBar } from './src/components/Layout/ActionBar.tsx';
export { default as ApiKeyModal } from './src/components/Layout/ApiKeyModal.tsx';
export { default as AppShell } from './src/components/Layout/AppShell.tsx';
export { default as ModeSelect } from './src/components/Layout/ModeSelect.tsx';
export { default as ModelLoadingOverlay } from './src/components/Layout/ModelLoadingOverlay.tsx';
export { default as ExportModal } from './src/components/NoteDoc/ExportModal.tsx';
export { default as MeetingInfoPanel } from './src/components/NoteDoc/MeetingInfoPanel.tsx';
export { default as NotionStatusPanel } from './src/components/Notion/NotionStatusPanel.tsx';
export { default as AudioFilePanel } from './src/components/Recording/AudioFilePanel.tsx';
export { default as LiveTranscript } from './src/components/Recording/LiveTranscript.tsx';
export { default as RecordingBar } from './src/components/Recording/RecordingBar.tsx';
export { default as SpeakerBubble } from './src/components/Recording/SpeakerBubble.tsx';
export { default as TextInputPanel } from './src/components/Recording/TextInputPanel.tsx';
export { default as VideoPanel } from './src/components/Recording/VideoPanel.tsx';
export { default as NotionConnectionPanel } from './src/components/Settings/NotionConnectionPanel.tsx';
export { default as NoteList } from './src/components/Sidebar/NoteList.tsx';
export { default as PreMeetingRoster } from './src/components/Speaker/PreMeetingRoster.tsx';
