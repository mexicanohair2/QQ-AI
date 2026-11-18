export type PreparedImage = {
  mimeType: "image/jpeg";
  dataUrl: string;
  sizeBytes: number;
};

export type PreparedVideoFrame = {
  mimeType: "image/jpeg";
  dataUrl: string;
  timestampMs: number;
  sizeBytes: number;
};

function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать медиафайл."));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Браузер не смог подготовить медиафайл."));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Браузер не смог сжать изображение."));
    }, "image/jpeg", quality);
  });
}

function drawScaled(
  canvas: HTMLCanvasElement,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  maxEdge: number,
): void {
  const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas недоступен в этом браузере.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
}

function loadImage(file: File): Promise<{ image: HTMLImageElement; objectUrl: string }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, objectUrl });
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Не удалось открыть изображение. Попробуй JPEG или PNG."));
    };
    image.src = objectUrl;
  });
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Поддерживаются изображения JPEG, PNG и WebP.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Исходное изображение больше 12 МБ. Выбери файл поменьше.");
  }

  const { image, objectUrl } = await loadImage(file);
  try {
    const canvas = document.createElement("canvas");
    drawScaled(canvas, image, image.naturalWidth, image.naturalHeight, 1280);
    let blob = await canvasToJpeg(canvas, 0.78);
    if (blob.size > 850_000) {
      drawScaled(canvas, image, image.naturalWidth, image.naturalHeight, 1024);
      blob = await canvasToJpeg(canvas, 0.65);
    }
    if (blob.size > 850_000) {
      drawScaled(canvas, image, image.naturalWidth, image.naturalHeight, 768);
      blob = await canvasToJpeg(canvas, 0.55);
    }
    if (blob.size > 850_000) {
      throw new Error("Изображение не удалось уменьшить до безопасного размера.");
    }
    return { mimeType: "image/jpeg", dataUrl: await fileToDataUrl(blob), sizeBytes: blob.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function waitForMediaEvent(
  target: HTMLMediaElement,
  successEvent: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Видео слишком долго подготавливается. Попробуй короткий MP4 или WebM."));
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timeout);
      target.removeEventListener(successEvent, onSuccess);
      target.removeEventListener("error", onError);
    };
    const onSuccess = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      reject(new Error("Браузер не смог прочитать это видео. Поддерживаются MP4 и WebM."));
    };
    target.addEventListener(successEvent, onSuccess, { once: true });
    target.addEventListener("error", onError, { once: true });
  });
}

function seekVideo(video: HTMLVideoElement, timestampSeconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Не удалось перейти к нужному кадру видео."));
    }, 8000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    const onSeeked = () => { cleanup(); resolve(); };
    const onError = () => {
      cleanup();
      reject(new Error("Ошибка чтения видеокадра."));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = timestampSeconds;
  });
}

/** Samples no more than eight frames locally. The original video/audio is never uploaded. */
export async function sampleVideoFrames(file: File): Promise<PreparedVideoFrame[]> {
  if (!["video/mp4", "video/webm"].includes(file.type)) {
    throw new Error("Поддерживаются видео MP4 и WebM.");
  }
  if (file.size > 30 * 1024 * 1024) {
    throw new Error("Видео больше 30 МБ. Выбери более короткий или сжатый ролик.");
  }

  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = objectUrl;

  try {
    video.load();
    await waitForMediaEvent(video, "loadedmetadata", 12000);
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Не удалось определить длительность видео.");
    }
    if (duration > 60) {
      throw new Error("Пока поддерживаются ролики длительностью до 60 секунд.");
    }

    const count = Math.min(8, Math.max(1, Math.ceil(duration / 4)));
    const canvas = document.createElement("canvas");
    const frames: PreparedVideoFrame[] = [];
    let totalBytes = 0;

    for (let index = 0; index < count; index += 1) {
      const timestampSeconds = duration * ((index + 0.5) / count);
      await seekVideo(video, Math.min(timestampSeconds, Math.max(0, duration - 0.08)));
      drawScaled(canvas, video, video.videoWidth, video.videoHeight, 960);
      let blob = await canvasToJpeg(canvas, 0.67);
      if (blob.size > 450_000) {
        drawScaled(canvas, video, video.videoWidth, video.videoHeight, 720);
        blob = await canvasToJpeg(canvas, 0.58);
      }
      totalBytes += blob.size;
      if (blob.size > 450_000 || totalBytes > 2_800_000) {
        throw new Error("Видеокадры занимают слишком много места. Выбери ролик меньшего разрешения.");
      }
      frames.push({
        mimeType: "image/jpeg",
        dataUrl: await fileToDataUrl(blob),
        timestampMs: Math.round(timestampSeconds * 1000),
        sizeBytes: blob.size,
      });
    }
    return frames;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export function dataUrlToBase64(dataUrl: string): string {
  const separator = dataUrl.indexOf(",");
  if (separator < 0) throw new Error("Неверный формат подготовленного изображения.");
  return dataUrl.slice(separator + 1);
}
