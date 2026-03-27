import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WOOK'S 회의록 - 지능형 회의록 시스템",
  description: "Clova Speech와 Gemini Pro를 활용한 맞춤형 다면 회의록 자동 생성 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
