declare module "*.js";

declare global {
  var QQQuantumBrowser: {
    ByteBPETokenizer: new (payload: unknown) => {
      encode(text: string, addBos?: boolean, addEos?: boolean): number[];
      decode(ids: number[], skipSpecial?: boolean): string;
    };
    QuantumBrowserModel: new (metadata: unknown, weights: ArrayBuffer) => {
      cfg: { block_size: number };
      generate(ids: number[], maxTokens?: number, temperature?: number, topK?: number, eos?: number): number[];
    };
    inflateGzipBase64(value: string): Promise<ArrayBuffer>;
  } | undefined;
}
export {};
