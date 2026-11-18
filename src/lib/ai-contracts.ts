/** Provider-neutral contracts shared by the QQ AI orchestrator and future game adapters.
 * These types describe capability boundaries; they do not imply that a provider is configured.
 */

export type AiCapability =
  | "text"
  | "reasoning"
  | "web_search"
  | "image_understanding"
  | "video_frames"
  | "audio_transcription"
  | "knowledge_retrieval"
  | "game_hint"
  | "game_explain"
  | "game_clue_drafting";

export type CapabilityState = "available" | "unconfigured" | "unsupported" | "degraded";

export type CapabilityDescriptor = {
  capability: AiCapability;
  state: CapabilityState;
  provider?: string;
  model?: string;
  reason?: string;
};

export type AiRoute =
  | "offline_text"
  | "online_text"
  | "web_research"
  | "image_qa"
  | "video_qa"
  | "knowledge_qa"
  | "game_hint"
  | "game_explain"
  | "game_clue_drafting";

export type AttachmentKind = "image" | "video";

export type AttachmentMetadata = {
  id: string;
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type VideoFrameReference = {
  timestampMs: number;
  mimeType: "image/jpeg" | "image/webp" | "image/png";
  /** Ephemeral transport reference; never a public URL or a persistent storage path. */
  payloadRef: string;
};

export type SearchSource = {
  title: string;
  url: string;
  domain: string;
  retrievedAt: string;
  publishedAt?: string;
  excerpt: string;
};

export type AiCitation = {
  sourceIndex: number;
  quote?: string;
  supports: string;
};

export type AiAnswer = {
  text: string;
  route: AiRoute;
  citations: AiCitation[];
  sources: SearchSource[];
  uncertainty?: string[];
  analyzedVideoTimestampsMs?: number[];
  mediaWasUploaded: boolean;
};

export type AiTaskRequest =
  | {
      task: "chat";
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    }
  | {
      task: "web_research";
      question: string;
      searchQuery?: string;
    }
  | {
      task: "image_qa";
      question: string;
      attachments: AttachmentMetadata[];
    }
  | {
      task: "video_qa";
      question: string;
      attachment: AttachmentMetadata;
      frames: VideoFrameReference[];
      audioTranscriptionRequested: boolean;
    }
  | {
      task: "knowledge_qa";
      question: string;
      collectionIds?: string[];
    };

export type AiProviderRequest = {
  task: AiTaskRequest;
  userId?: string;
  signal?: AbortSignal;
};

export type AiProviderResult = {
  answer: AiAnswer;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
  };
};

export interface TextModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  generate(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options?: { temperature?: number; maxOutputTokens?: number; signal?: AbortSignal },
  ): Promise<string>;
}

export interface VisionModelAdapter {
  readonly providerId: string;
  readonly modelId: string;
  analyzeImages(input: {
    question: string;
    images: Array<{ mimeType: string; bytes: Uint8Array }>;
    signal?: AbortSignal;
  }): Promise<{ text: string; uncertainty: string[] }>;
  analyzeVideoFrames?(input: {
    question: string;
    frames: Array<{ timestampMs: number; mimeType: string; bytes: Uint8Array }>;
    signal?: AbortSignal;
  }): Promise<{ text: string; analyzedTimestampsMs: number[]; uncertainty: string[] }>;
}

export interface SearchAdapter {
  readonly providerId: string;
  search(query: string, options?: { limit?: number; signal?: AbortSignal }): Promise<SearchSource[]>;
  fetchSource(source: SearchSource, options?: { maxCharacters?: number; signal?: AbortSignal }): Promise<string>;
}

/** Game AI may propose language, never mutate authoritative game state. */
export type GameAiTask =
  | { task: "hint"; clue: string; answerForValidationOnly: string; knownLetters?: string; level: 1 | 2 }
  | { task: "explain"; clue: string; approvedAnswer: string }
  | { task: "write_clues"; approvedAnswers: string[]; style?: "simple" | "logical" | "educational" };

export type GameAiProposal =
  | { task: "hint"; hint: string; revealsAnswer: false }
  | { task: "explain"; explanation: string; steps: string[]; ambiguity: "low" | "medium" | "high" }
  | { task: "write_clues"; items: Array<{ answer: string; clue: string }> };
