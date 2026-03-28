# WOOK'S 회의록 (Professional Meeting Minutes Solution) 📝

**WOOK'S 회의록**은 최첨단 인공지능(Gemini 2.5 Flash)과 클로바 음성 인식(STT) 기술을 결합하여, 단순한 기록을 넘어 **비즈니스 인사이트**를 도출하는 토탈 회의 관리 솔루션입니다. 

실무자의 입장에서 설계된 정교한 레이아웃과 강력한 내보내기 기능을 통해 회의 운영의 패러다임을 바꿉니다.

---

## 🔥 주요 고도화 기능 (Advanced Features)

### 🎙️ 1. 지능형 화자 인식 (Speaker Diarization)
- **누가 말했는가?**: Clova Speech의 화자 분리 기술을 적용하여 실시간 녹음 및 파일 분석 시 `[화자 1]`, `[화자 2]`와 같이 발화자를 명확히 식별합니다.
- **맥락 분석**: AI가 발화자별 의사결정 비중과 행동 계획을 더 정밀하게 분석합니다.

### 🧠 2. 고품질 AI 분석 및 일관성
- **Deterministic Logic**: `Temperature 0.1` 설정을 통해 동일한 회의 내용에 대해 일관성 있고 신뢰할 수 있는 요약 결과를 보장합니다.
- **비즈니스 개조식 문체**: 전문 컨설턴트 수준의 '~함', '~임' 어투를 사용하여 즉시 보고 가능한 퀄리티의 결과물을 생성합니다.

### 📄 3. 섹션 최적화 PDF/Word 내보내기
- **Intelligent Pagination**: 표의 행(Row)이나 리스트 항목 단위로 페이지를 나누어 공간 낭비를 최소화하고 가독성을 높였습니다.
- **표 헤더 자동 반복**: 표가 다음 페이지로 넘어갈 때 제목행(`thead`)이 상단에 자동으로 복제됩니다.
- **프로페셔널 레이아웃**: 웹 화면의 디자인을 100% 보존하면서도 인쇄 시에는 불필요한 브랜딩을 제거하여 공신력 있는 문서를 제공합니다.

### ⚙️ 4. 프라이버시 중심의 자격 증명 시스템
- **Privacy-First**: 모든 API 키(Gemini, Clova, Notion)는 서버가 아닌 사용자의 브라우저(`LocalStorage`)에만 안전하게 보관됩니다.
- **Zero-Logging**: 회의 원문과 분석 데이터는 오직 사용자의 기기에서만 처리됩니다.

---

## 🚀 시작하기 (Getting Started)

### 1. 로컬 개발 환경 구성
```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev
```
브라우저에서 `http://localhost:3000` 접속

### 2. API 자격 증명 설정 (필수)
앱 우측 상단의 **톱니바퀴(⚙️) 버튼**을 눌러 다음 정보를 설정하세요:
- **Google Gemini API Key**: AI 분석 엔진용 (v2.5 Flash 모델 사용)
- **Clova Speech**: `Invoke URL` 및 `Secret Key` (음성 인식 및 화자 분리용)
- **Notion Integration**: `Internal Integration Token` 및 `Database ID` (자동 기록용)

---

## 🛠 Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Vanilla CSS
- **AI/ML**: Google Gemini 2.5 Flash, Naver Clova Speech (Diarization)
- **Document Engine**: `jspdf` & `html2canvas` (PDF), `docx` (MS Word)
- **Integration**: Notion API via `@notionhq/client`

---

## 🛡 Security & Ethics
본 프로젝트는 데이터 주권(Data Sovereignty)을 준수하며, 사용자 개인의 API 키를 활용하여 완전한 독립형 서비스 운영을 목표로 합니다.

---
Created with ❤️ by **Antigravity AI Agent** & **WOOK** (v2.8 Final)
