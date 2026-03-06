'use client';

import { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core';
import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions';
import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
} from '@blocknote/react';
import { Table2 } from 'lucide-react';
import { useCallback } from 'react';

const DEFAULT_TABLE_CONTENT = {
  type: 'tableContent',
  rows: [
    { cells: ['', '', ''] },
    { cells: ['', '', ''] },
  ],
} as const;

function InsertTableButton() {
  const Components = useComponentsContext()!;
  const dict = useDictionary();
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>();

  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      if (!editor.isEditable || !('table' in editor.schema.blockSchema)) {
        return undefined;
      }

      return { canInsert: true };
    },
  });

  const insertTable = useCallback(() => {
    editor.focus();
    insertOrUpdateBlockForSlashMenu(editor, {
      type: 'table',
      content: DEFAULT_TABLE_CONTENT as never,
    });
  }, [editor]);

  if (state === undefined) {
    return null;
  }

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="insertTable"
      onClick={insertTable}
      isSelected={false}
      label={dict.slash_menu.table.title}
      mainTooltip={dict.slash_menu.table.title}
      icon={<Table2 className="h-4 w-4" />}
    />
  );
}

export default function CenteredFormattingToolbar() {
  const items = getFormattingToolbarItems();
  const linkButtonIndex = items.findIndex((item) => item.key === 'createLinkButton');
  const insertIndex = linkButtonIndex >= 0 ? linkButtonIndex : items.length;
  items.splice(insertIndex, 0, <InsertTableButton key="insertTableButton" />);

  return (
    <div className="blocknote-toolbar-shell shrink-0 flex justify-center px-4 pt-1 pb-3">
      <div className="max-w-full overflow-x-auto">
        <div className="min-w-max">
          <FormattingToolbar>{items}</FormattingToolbar>
        </div>
      </div>
    </div>
  );
}
