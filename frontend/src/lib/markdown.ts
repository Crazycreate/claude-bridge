import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/common';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import 'highlight.js/styles/github.css';

/**
 * Marked instance with highlight.js for syntax colouring inside fenced code
 * blocks. Falls back to plain text when the language is unknown, so unusual
 * input never throws.
 */
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value;
      } catch {
        return code;
      }
    },
  }),
);
marked.setOptions({ gfm: true, breaks: true });

/**
 * Render Claude's markdown reply to sanitized HTML.
 * The output is sanitized with DOMPurify before it ever reaches the DOM.
 */
export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
