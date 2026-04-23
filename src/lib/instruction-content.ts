type BlockNoteInlineContent = { type: string; text?: string };
type BlockNoteBlock = {
  content?: BlockNoteInlineContent[];
  children?: BlockNoteBlock[];
};

function extractTextFromBlocks(blocks: BlockNoteBlock[]): string {
  return blocks
    .map(block => {
      const text = (block.content ?? [])
        .map(c => (c.type === 'text' ? (c.text ?? '') : ''))
        .join('');
      const children = block.children?.length
        ? extractTextFromBlocks(block.children)
        : '';
      return [text, children].filter(Boolean).join('\n');
    })
    .join('\n');
}

export function instructionToPlainText(content: string): string {
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return extractTextFromBlocks(parsed);
  } catch { /* not JSON */ }
  return content;
}
