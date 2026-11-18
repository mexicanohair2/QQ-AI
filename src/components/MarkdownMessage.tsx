import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function remarkAnswerUnderline() {
  return (tree: any) => {
    const visit = (node: any): void => {
      if (!Array.isArray(node.children)) return;
      const next: any[] = [];
      for (const child of node.children) {
        if (child.type === "text" && typeof child.value === "string" && child.value.includes("==")) {
          const parts = child.value.split(/==(.*?)==/g);
          parts.forEach((part: string, index: number) => {
            if (!part) return;
            if (index % 2 === 1) {
              next.push({
                type: "strong",
                data: { hProperties: { className: ["answer-underline"] } },
                children: [{ type: "text", value: part }],
              });
            } else {
              next.push({ type: "text", value: part });
            }
          });
        } else {
          visit(child);
          next.push(child);
        }
      }
      node.children = next;
    };
    visit(tree);
  };
}

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath, remarkAnswerUnderline]}
      rehypePlugins={[rehypeKatex]}
    >
      {content}
    </ReactMarkdown>
  );
}
