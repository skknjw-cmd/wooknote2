import { NextRequest, NextResponse } from "next/server";
import { Client } from "@notionhq/client";

export async function POST(req: NextRequest) {
  try {
    const { title, date, location, attendees, sections } = await req.json();

    const notionToken = req.headers.get("x-notion-token") || process.env.NOTION_TOKEN;
    let databaseId = req.headers.get("x-notion-db-id") || process.env.NOTION_DATABASE_ID;

    if (!notionToken || !databaseId) {
      return NextResponse.json({ error: "Notion 자격 증명이 설정되지 않았습니다. 우측 상단 설정을 확인해주세요." }, { status: 401 });
    }

    // Sanitize databaseId: Strip query parameters or full URL parts if present
    if (databaseId.includes("?")) {
      databaseId = databaseId.split("?")[0];
    }
    databaseId = databaseId.trim();

    const notion = new Client({ auth: notionToken });

    // Construct Notion blocks from sections
    const childrenBlocks: any[] = [
      {
        object: "block",
        type: "heading_2",
        heading_2: { rich_text: [{ type: "text", text: { content: "회의 정보" } }] },
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            { type: "text", text: { content: `일시: ${date}${location ? ` | 장소: ${location}` : ""}\n참석자: ${attendees.join(", ")}` } },
          ],
        },
      },
    ];

    sections.forEach((sec: any) => {
      childrenBlocks.push({
        object: "block",
        type: "heading_3",
        heading_3: { rich_text: [{ type: "text", text: { content: sec.name } }] },
      });

      if (Array.isArray(sec.content)) {
        sec.content.forEach((item: string) => {
          childrenBlocks.push({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: { rich_text: [{ type: "text", text: { content: item } }] },
          });
        });
      } else {
        childrenBlocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ type: "text", text: { content: sec.content } }] },
        });
      }
    });

    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties: {
        title: {
          title: [{ type: "text", text: { content: title } }],
        },
      },
      children: childrenBlocks,
    });

    return NextResponse.json({ success: true, pageId: response.id });
  } catch (error: any) {
    console.error("Notion API Error:", {
      message: error.message,
      code: error.code,
      body: error.body,
    });
    
    let errorMessage = error.message || "Unknown error";
    if (error.body) {
      try {
        const parsed = JSON.parse(error.body);
        errorMessage = parsed.message || errorMessage;
      } catch (e) {}
    }

    return NextResponse.json({ error: errorMessage }, { status: error.status || 500 });
  }
}
