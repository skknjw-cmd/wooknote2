"use client";

import React, { useEffect, useState, useRef } from "react";
import styles from "./page.module.css";
import SummaryBoard from "@/components/ResultSection/SummaryBoard";
import ExportTools from "@/components/ResultSection/ExportTools";
import TranscriptEditor from "@/components/ResultSection/TranscriptEditor";
import { useRouter } from "next/navigation";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Document, Packer, Paragraph, TextRun, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle, Header } from "docx";
import { saveAs } from "file-saver";
import {
  loadMeetingResult,
  saveMeetingResult,
} from "@/lib/meetingStorage";
import type {
  SavedMeetingResultV2,
  AnalysisResult,
  Segment,
  SpeakerMapping,
} from "@/types/meeting";

export default function ResultPage() {
  const router = useRouter();
  const [savedResult, setSavedResult] = useState<SavedMeetingResultV2 | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isPdfGenerating, setIsPdfGenerating] = useState(false);
  const [isWordGenerating, setIsWordGenerating] = useState(false);
  const [isNotionSaving, setIsNotionSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loaded = loadMeetingResult();
    if (!loaded) {
      alert("저장된 회의록이 없거나 만료되었습니다.");
      router.push("/");
      return;
    }
    setSavedResult(loaded);
    setResult(loaded.analysis);
  }, [router]);

  const handleEditorUpdate = (
    nextAnalysis: AnalysisResult,
    nextMapping: SpeakerMapping,
    nextSegments: Segment[]
  ) => {
    if (!savedResult) return;
    // Preserve original generatedAt so the 30-day TTL stays anchored to
    // the first generation, not to each post-edit save.
    saveMeetingResult({
      analysis: nextAnalysis,
      segments: nextSegments,
      mapping: nextMapping,
      meetingInfo: savedResult.meetingInfo,
      selectedOptions: savedResult.selectedOptions,
      generatedAt: savedResult.generatedAt,
    });
    setSavedResult({
      ...savedResult,
      analysis: nextAnalysis,
      mapping: nextMapping,
      segments: nextSegments,
    });
    setResult(nextAnalysis);
  };

  const handleReanalyze = async (
    finalText: string,
    signal: AbortSignal
  ): Promise<AnalysisResult> => {
    if (!savedResult) throw new Error("no saved result");
    const settingsRaw = localStorage.getItem("wooks_settings");
    const settings = settingsRaw ? JSON.parse(settingsRaw) : {};
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (settings.geminiKey) headers["x-gemini-key"] = settings.geminiKey;
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers,
      signal,
      body: JSON.stringify({
        meetingInfo: savedResult.meetingInfo,
        selectedOptions: savedResult.selectedOptions,
        content: finalText,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as AnalysisResult;
  };

  const handleExportPDF = async () => {
    if (!result || !printRef.current) return;

    setIsPdfGenerating(true);
    try {
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const bottomLimit = pdfHeight - margin;
      let currentY = margin;

      const captureElement = async (el: HTMLElement) => {
        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: "#ffffff",
        });
        const imgData = canvas.toDataURL("image/png");
        const imgWidth = pdfWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        return { imgData, imgHeight, imgWidth };
      };

      const sections = printRef.current.querySelectorAll("[data-pdf-section]");

      for (let i = 0; i < sections.length; i++) {
        const section = sections[i] as HTMLElement;
        const items = section.querySelectorAll("[data-pdf-item]");

        if (items.length === 0) {
          const { imgData, imgHeight, imgWidth } = await captureElement(section);
          if (currentY + imgHeight > bottomLimit) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.addImage(imgData, "PNG", margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 8;
          continue;
        }

        const sectionHeader =
          section.querySelector("h2") || section.querySelector("div:first-child");
        if (sectionHeader) {
          const { imgData, imgHeight, imgWidth } = await captureElement(
            sectionHeader as HTMLElement
          );
          if (currentY + imgHeight > bottomLimit) {
            pdf.addPage();
            currentY = margin;
          }
          pdf.addImage(imgData, "PNG", margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight + 2;
        }

        const tableHeader = section.querySelector("[data-pdf-table-header]");
        let tableHeaderImg: { imgData: string; imgHeight: number; imgWidth: number } | null = null;

        if (tableHeader) {
          tableHeaderImg = await captureElement(tableHeader as HTMLElement);
        }

        for (let j = 0; j < items.length; j++) {
          const item = items[j] as HTMLElement;
          const { imgData, imgHeight, imgWidth } = await captureElement(item);

          if (currentY + imgHeight > bottomLimit) {
            pdf.addPage();
            currentY = margin;
            if (tableHeaderImg) {
              pdf.addImage(
                tableHeaderImg.imgData,
                "PNG",
                margin,
                currentY,
                tableHeaderImg.imgWidth,
                tableHeaderImg.imgHeight
              );
              currentY += tableHeaderImg.imgHeight;
            }
          }

          pdf.addImage(imgData, "PNG", margin, currentY, imgWidth, imgHeight);
          currentY += imgHeight;
        }

        currentY += 10;
      }

      pdf.save(`${result.title}_회의록.pdf`);
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert("PDF 생성 중 오류가 발생했습니다.");
    } finally {
      setIsPdfGenerating(false);
    }
  };

  const handleExportWord = async () => {
    if (!result) return;
    setIsWordGenerating(true);
    try {
      const location = savedResult?.meetingInfo.location ?? "";
      const children: (Paragraph | Table)[] = [
        new Paragraph({
          children: [
            new TextRun({
              text: result.title,
              bold: true,
              size: 48,
              font: "Malgun Gothic",
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 800, after: 600 },
        }),
        new Paragraph({
          children: [
            new TextRun({ text: `일시: ${result.date}`, bold: true, size: 22 }),
            new TextRun({
              text: `\n장소: ${location || "정보 없음"}`,
              break: 1,
              size: 22,
            }),
            new TextRun({
              text: `\n참석자: ${result.attendees.join(", ")}`,
              break: 1,
              size: 22,
            }),
          ],
          spacing: { after: 600 },
        }),
      ];

      result.sections.forEach((sec) => {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: sec.name,
                bold: true,
                size: 28,
                color: "333333",
              }),
            ],
            spacing: { before: 500, after: 300 },
          })
        );

        if (sec.type === "table" && Array.isArray(sec.content)) {
          const table = new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            rows: [
              new TableRow({
                children: ["실행과제", "담당자", "기한", "우선순위", "비고"].map(
                  (text) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text, bold: true, size: 20 }),
                          ],
                          alignment: AlignmentType.CENTER,
                        }),
                      ],
                      shading: { fill: "F2F2F2" },
                      verticalAlign: AlignmentType.CENTER,
                    })
                ),
              }),
              ...sec.content.map(
                (row) =>
                  new TableRow({
                    children: [row.task, row.owner, row.due, row.prio, row.notes].map(
                      (text) =>
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: String(text || "-"),
                                  size: 18,
                                }),
                              ],
                            }),
                          ],
                          verticalAlign: AlignmentType.CENTER,
                        })
                    ),
                  })
              ),
            ],
          });
          children.push(table);
        } else if (sec.type === "numbered" && Array.isArray(sec.content)) {
          sec.content.forEach((item, i) => {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${String(i + 1).padStart(2, "0")}. ${item.title}`,
                    bold: true,
                    size: 24,
                    color: "555555",
                  }),
                  new TextRun({
                    text: `\n${item.description}`,
                    break: 1,
                    size: 20,
                    color: "666666",
                  }),
                ],
                spacing: { before: 200, after: 150 },
                indent: { left: 400 },
              })
            );
          });
        }
      });

      const doc = new Document({
        sections: [
          {
            headers: {
              default: new Header({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: "Meeting Minutes",
                        color: "888888",
                        size: 16,
                      }),
                    ],
                    border: {
                      bottom: {
                        style: BorderStyle.SINGLE,
                        size: 6,
                        color: "CCCCCC",
                        space: 1,
                      },
                    },
                    spacing: { after: 200 },
                  }),
                ],
              }),
            },
            children,
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${result.title}_회의록.docx`);
    } catch (error) {
      console.error("Word Export Error:", error);
      alert("Word 생성 중 오류가 발생했습니다.");
    } finally {
      setIsWordGenerating(false);
    }
  };

  const handleExportNotion = async () => {
    if (!result || !savedResult) return;
    setIsNotionSaving(true);
    try {
      const savedSettings = localStorage.getItem("wooks_settings");
      const settings = savedSettings ? JSON.parse(savedSettings) : {};

      const customHeaders: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (settings.notionToken)
        customHeaders["x-notion-token"] = settings.notionToken;
      if (settings.notionDbId)
        customHeaders["x-notion-db-id"] = settings.notionDbId;

      const notionPayload = {
        ...result,
        location: savedResult.meetingInfo.location,
      };

      const res = await fetch("/api/notion", {
        method: "POST",
        headers: customHeaders,
        body: JSON.stringify(notionPayload),
      });

      const data = await res.json();
      if (res.ok) {
        alert("Notion에 성공적으로 전송되었습니다.");
      } else {
        throw new Error(data.error || "Notion 전송에 실패했습니다.");
      }
    } catch (error: unknown) {
      console.error("Notion Export Error:", error);
      const msg = error instanceof Error ? error.message : "unknown";
      alert(`노션 전송 실패: ${msg}`);
    } finally {
      setIsNotionSaving(false);
    }
  };

  const handleRedo = () => {
    router.push("/");
  };

  const handleStartNew = () => {
    localStorage.removeItem("wooks_temp_input");
    router.push("/");
  };

  if (!result || !savedResult)
    return <div className={styles.container}>Loading...</div>;

  const hasSegments = savedResult.segments.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div style={{ textAlign: "left" }}>
          <h1 className={styles.title} style={{ margin: 0 }}>
            WOOK&apos;S 회의록
          </h1>
          <p
            className={styles.subtitle}
            style={{ margin: 0, fontSize: "0.85rem", opacity: 0.7 }}
          >
            분석 결과 리포트
          </p>
        </div>

        <div className={styles.navGroup}>
          <button onClick={handleRedo} className={styles.navBtn}>
            ↺ 재작성
          </button>
          <button onClick={handleStartNew} className={styles.navBtn}>
            + 새로 작성
          </button>
        </div>

        <ExportTools
          onExportPDF={handleExportPDF}
          onExportWord={handleExportWord}
          onExportNotion={handleExportNotion}
          isPdfGenerating={isPdfGenerating}
          isWordGenerating={isWordGenerating}
          isNotionSaving={isNotionSaving}
        />
      </header>

      <main className={styles.main}>
        {hasSegments && (
          <TranscriptEditor
            savedResult={savedResult}
            attendeesCsv={savedResult.meetingInfo.attendees}
            onUpdate={handleEditorUpdate}
            onReanalyze={handleReanalyze}
          />
        )}
        <div
          ref={printRef}
          style={{ width: "100%", padding: "20px", backgroundColor: "#ffffff" }}
        >
          <SummaryBoard result={result} />
        </div>
      </main>
    </div>
  );
}
