import { lazy, Suspense, useEffect, useMemo, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
const MarkdownMessage = lazy(() => import("./components/MarkdownMessage"));
import { createClient, type Session } from "@supabase/supabase-js";
import { calculateMathQuestion } from "./lib/math";
import { dataUrlToBase64, prepareImage, sampleVideoFrames } from "./lib/media";
import { buildSearchContext, buildSearchOnlyAnswer, parseMediaWikiResults, shouldSearchWeb, type QQSearchSource } from "./lib/qq-ai-core";
import { readOpenAIChatStream } from "./lib/openai-stream";
import { readChatMessages, persistChatMessages, readChatThreadId, persistChatThreadId, type ChatMessage } from "./lib/chat-storage";
import { buildMemoryInstruction, normalizeMemoryEntries, readStoredMemories, persistStoredMemories, readStoredMemoryPreference, resolveMemoryEnabled, persistStoredMemoryEnabled, MAX_MEMORY_CHARS } from "./lib/user-memory";
import { canAttachMedia, selectVisionBackend, selectLocalVideoFrames } from "./lib/vision-routing";
import { appendTranscript, resampleTo16kMono, SPEECH_SAMPLE_RATE, MAX_LOCAL_SPEECH_SECONDS } from "./lib/local-audio";
import { getOtherLocalRuntimes, type LocalRuntime } from "./lib/local-runtime";
import { withTimeout } from "./lib/with-timeout";

type Message = ChatMessage;
type MediaAttachment = { id: string; file: File; name: string; kind: "image" | "video"; previewUrl: string };
type Mode = "online" | "offline";
const MODEL_ID = "Qwen2.5-0.5B-In¶»§q«^