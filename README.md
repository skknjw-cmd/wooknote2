# WOOK'S 회의록 (Meeting Minutes Auto-Summary) 📝

**WOOK'S 회의록**은 인공지능(Gemini 2.5 Flash)과 클로바 음성 인식(STT) 기술을 결합하여, 회의 내용을 자동으로 기록하고 분석해주는 스마트 오피스 도구입니다. 

미니멀한 **무인양품(MUJI) 스타일**의 디자인과 강력한 분석 기능을 통해 회의록 작성 시간을 혁신적으로 단축해 드립니다.

---

## ✨ 핵심 기능 (Core Features)

- 🎙️ **멀티 모달 입력**: 실시간 음성 녹음, 오디오 파일 업로드, 직접 텍스트 입력을 모두 지원합니다.
- ⚡ **실시간 STT 피드백**: 녹음 즉시 텍스트로 변환되어 내용을 바로 확인하고 수정할 수 있습니다.
- 🧠 **9가지 지능형 분석**: 핵심요약, To-Do List, 주요 결정 사항 등 9가지 항목 중 원하는 것만 골라 맞춤형 회의록을 생성합니다.
- 📤 **강력한 내보내기**:
  - **Notion 연동**: 클릭 한 번으로 개인 노션 데이터베이스에 회의록 페이지 생성.
  - **PDF 다운로드**: 디자인과 한글 레이아웃이 완벽 보존된 고해상도 PDF 추출.
  - **MS Word**: 구조화된 문서 형식(`.docx`) 지원.

---

## ⚙️ 시작하기 (Getting Started)

이 프로젝트는 보안을 위해 개별 사용자가 자신의 API 자격 증명을 직접 입력하여 사용하도록 설계되었습니다.

### 1. 로컬에서 실행하기
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```
브라우저에서 `http://localhost:3000` 접속

### 2. API 설정 (중요!)
앱 우측 상단의 **톱니바퀴(⚙️) 버튼**을 눌러 아래 정보를 설정해 주세요.
- **Google Gemini API**: 분석 엔진용
- **Clova Speech**: 음성 인식용
- **Notion**: 연동용 (Token 및 Database ID)

*입력하신 정보는 서버에 저장되지 않으며, 오직 귀하의 브라우저(LocalStorage)에만 안전하게 보관됩니다.*

---

## 🛠 Tech Stack

- **Framework**: Next.js 14 (App Router)
- **AI**: Google Gemini 2.5 Flash
- **STT**: Naver Clova Speech
- **Design**: Vanilla CSS (Warm beige/Minimalism)
- **Library**: `@notionhq/client`, `html2canvas`, `jspdf`, `docx`

---

## 🛡 Security & Privacy
본 프로젝트는 개별 사용자의 API 키 노출을 방지하기 위해 로컬 환경 설정(`.env`)과 브라우저 기반 설정 시스템을 병행하여 사용합니다. 공유 시 개인의 `.env` 파일은 절대로 포함되지 않도록 주의해 주세요.

---
Created with ❤️ by **Antigravity AI Agent**
