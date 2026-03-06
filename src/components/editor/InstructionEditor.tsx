'use client';

import { useEffect, useRef, useState } from 'react';
import { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteViewEditor } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import '@blocknote/mantine/style.css';
import '@blocknote/core/fonts/inter.css';
import CenteredFormattingToolbar from './CenteredFormattingToolbar';

interface InstructionEditorProps {
  initialContent?: string;
  onChange?: (content: string) => void;
  editable?: boolean;
}

export default function InstructionEditor({
  initialContent = '',
  onChange,
  editable = true
}: InstructionEditorProps) {
  const [editor, setEditor] = useState<BlockNoteEditor | null>(null);
  const initialContentRef = useRef(initialContent);

  useEffect(() => {
    let isMounted = true;
    let activeEditor: BlockNoteEditor | null = null;

    const initEditor = async () => {
      const newEditor = BlockNoteEditor.create();
      activeEditor = newEditor;

      // Load initial markdown content
      if (initialContentRef.current) {
        try {
          const blocks = await newEditor.tryParseMarkdownToBlocks(initialContentRef.current);
          newEditor.replaceBlocks(newEditor.document, blocks);
        } catch (error) {
          console.error('Failed to parse markdown:', error);
        }
      }

      if (isMounted) {
        setEditor(newEditor);
      } else {
        newEditor._tiptapEditor.destroy();
      }
    };

    initEditor();

    return () => {
      isMounted = false;
      if (activeEditor) {
        activeEditor._tiptapEditor.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (!editor || !onChange || !editable) return;

    const handleChange = async () => {
      try {
        const markdown = await editor.blocksToMarkdownLossy(editor.document);
        onChange(markdown);
      } catch (error) {
        console.error('Failed to convert to markdown:', error);
      }
    };

    const unsubscribe = editor.onChange(handleChange);

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [editor, onChange, editable]);

  if (!editor) {
    return <div className="p-4 text-gray-500">Loading editor...</div>;
  }

  return (
    <div className={editable ? "border border-gray-300 rounded-lg overflow-hidden min-h-[300px] max-h-[600px]" : "max-h-[600px] overflow-y-auto"}>
      <BlockNoteView
        editor={editor}
        editable={editable}
        theme="light"
        formattingToolbar={false}
        renderEditor={false}
        className={editable ? "flex h-full min-h-[300px] max-h-[600px] flex-col" : undefined}
      >
        {editable ? <CenteredFormattingToolbar /> : null}
        <div className={editable ? "flex-1 min-h-0 overflow-y-auto" : undefined}>
          <BlockNoteViewEditor />
        </div>
      </BlockNoteView>
    </div>
  );
}
