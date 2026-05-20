import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface VideoContext {
  id: string;
  title: string;
  transcript: string;
}

function buildSystemPrompt(videoContext: VideoContext | null): string {
  if (videoContext) {
    const transcript = videoContext.transcript
      ? `\n\nTranscript context (first 3000 chars):\n${videoContext.transcript.slice(0, 3000)}`
      : '';
    return `You are an expert video editor AI for QuickAI Short. The user is editing: "${videoContext.title}".${transcript}

Help them with specific editing decisions. When suggesting cuts or edits, be specific about timestamps if available. Keep answers concise and actionable.`;
  }
  return `You are QuickAI Studio AI, a helpful guide for short-form video creators. Help with strategy, ideas, formats, hooks, and best practices for viral short-form content on TikTok, YouTube Shorts, and Instagram Reels. Keep answers concise and actionable.`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { content: 'AI service not configured — GEMINI_API_KEY missing.' },
      { status: 503 },
    );
  }

  let messages: ChatMessage[];
  let videoContext: VideoContext | null;

  try {
    ({ messages, videoContext } = await req.json());
  } catch {
    return NextResponse.json({ content: 'Invalid request body.' }, { status: 400 });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ content: 'No messages provided.' }, { status: 400 });
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'user') {
    return NextResponse.json({ content: 'Last message must be from user.' }, { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(videoContext ?? null),
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    });

    // Build strictly alternating history (all messages except the last user turn)
    const historyMessages = messages.slice(0, -1);
    const rawHistory = historyMessages.map((m) => ({
      role: m.role === 'user' ? ('user' as const) : ('model' as const),
      parts: [{ text: m.content }],
    }));

    // Deduplicate consecutive same-role messages and ensure ends with model turn
    const chatHistory: typeof rawHistory = [];
    for (const msg of rawHistory) {
      if (
        chatHistory.length === 0 ||
        chatHistory[chatHistory.length - 1].role !== msg.role
      ) {
        chatHistory.push(msg);
      }
    }
    while (
      chatHistory.length > 0 &&
      chatHistory[chatHistory.length - 1].role === 'user'
    ) {
      chatHistory.pop();
    }

    const chat = model.startChat({ history: chatHistory });
    const result = await chat.sendMessage(lastMessage.content);
    const content = result.response.text().trim();

    return NextResponse.json({ content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/ai/chat] Gemini error:', msg);

    if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) {
      return NextResponse.json(
        { content: 'Rate limit reached — please wait a moment and try again.' },
        { status: 200 },
      );
    }
    if (/API_KEY|401|403/i.test(msg)) {
      return NextResponse.json(
        { content: 'AI service authentication error.' },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { content: 'Something went wrong — please try again.' },
      { status: 200 },
    );
  }
}
