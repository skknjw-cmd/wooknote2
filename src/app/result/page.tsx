"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import SummaryBoard from "@/components/ResultSection/SummaryBoard";
import ExportTools from "@/components/ResultSection/ExportTools";
import Link from "next/link";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const data = localStorage.getItem("last_meeting_result");
    if (data) {
      setResult(JSON.parse(data));
    } else {
      router.push("/"); // No data, go back
    }
  }, [router]);

  const handleExportPDF = async () => {
    if (!result || !printRef.current) return;
    
    setIsExporting(true);
    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2, // High resolution
        useCORS: true,
        logging: false,
        backgroundColor: "#f7f6f2" // MUJI beige
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${result.title}_회의록.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportWord = async () => {
    if (!result) return;
    
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: result.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `일시: ${result.date}`, size: "10pt" }),
              new TextRun({ text: `\n참석자: ${result.attendees.join(", ")}`, size: "10pt" })
            ],
            spacing: { after: 400 },
          }),
          ...result.sections.flatMap((sec: any) => [
            new Paragraph({
              text: sec.name,
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 },
            }),
            ...(Array.isArray(sec.content) 
              ? sec.content.map((item: string) => new Paragraph({ text: item, bullet: { level: 0 } }))
              : [new Paragraph({ text: sec.content })]
            )
          ])
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${result.title}_회의록.docx`);
  };

  const handleExportNotion = async () => {
    if (!result) return;
    setIsExporting(true);
    try {
      const savedSettings = localStorage.getItem("wooks_settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};
      
      const customHeaders: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (settings.notionToken) customHeaders["x-notion-token"] = settings.notionToken;
      if (settings.notionDbId) customHeaders["x-notion-db-id"] = settings.notionDbId;

      const res = await fetch("/api/notion", {
        method: "POST",
        headers: customHeaders,
        body: JSON.stringify(result),
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert("Notion에 성공적으로 전송되었습니다.");
      } else {
        throw new Error(data.error || "Notion 전송에 실패했습니다.");
      }
    } catch (error: any) {
      console.error("Notion Export Error:", error);
      alert(`노션 전송 실패: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  if (!result) return <div className={styles.container}>Loading...</div>;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href="/" className={styles.backLink}>← 처음으로</Link>
        <h1 className={styles.title}>분석 결과</h1>
      </header>

      <main className={styles.main}>
        <div ref={printRef} style={{ width: "100%", padding: "20px", backgroundColor: "#f7f6f2" }}>
          <SummaryBoard result={result} />
        </div>
        <ExportTools 
          onExportPDF={handleExportPDF}
          onExportWord={handleExportWord}
          onExportNotion={handleExportNotion}
          isExporting={isExporting}
        />
      </main>
    </div>
  );
}
