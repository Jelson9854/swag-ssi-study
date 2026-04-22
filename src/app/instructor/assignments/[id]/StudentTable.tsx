
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';
import DeleteStudentSessionButton from './DeleteStudentSessionButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, PlayCircle, FileText, Users } from 'lucide-react';

interface StudentWithStats {
  id: string;
  participantToken: string;
  startedAt: Date;
  lastSavedAt: Date | null;
  stats: {
    submissions: number;
    pasteInternal: number;
    pasteExternal: number;
    snapshots: number;
  };
}

interface StudentTableProps {
  students: StudentWithStats[];
}

const columnHelper = createColumnHelper<StudentWithStats>();

export default function StudentTable({ students }: StudentTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'participantToken', desc: false }
  ]);
  const [sortKey, setSortKey] = useState('participantToken:asc');
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo(
    () => [
      columnHelper.accessor('participantToken', {
        id: 'participantToken',
        header: 'Participant',
        cell: (info) => (
          <div className="text-sm font-medium text-[hsl(var(--foreground))] font-mono">
            {info.getValue() || '—'}
          </div>
        ),
      }),
      columnHelper.accessor('startedAt', {
        header: 'Started',
        cell: (info) => (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            {new Date(info.getValue()).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
          </span>
        ),
      }),
      columnHelper.accessor('lastSavedAt', {
        header: 'Last Active',
        cell: (info) => (
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            {info.getValue() ? new Date(info.getValue()!).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
          </span>
        ),
      }),
      columnHelper.accessor('stats.submissions', {
        header: 'Submissions',
        cell: (info) => (
          <div className="flex">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              {info.getValue()}
            </span>
          </div>
        ),
      }),
      columnHelper.accessor((row) => row.stats, {
        id: 'pastes',
        header: 'Copy/Paste',
        cell: (info) => {
          const stats = info.getValue();
          return (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[hsl(var(--muted-foreground))]">
                <span className="font-medium text-emerald-600">{stats.pasteInternal}</span> internal
              </span>
              {stats.pasteExternal > 0 && (
                <span className="text-xs text-[hsl(var(--destructive))] font-medium">
                  {stats.pasteExternal} external
                </span>
              )}
            </div>
          );
        },
        enableSorting: false,
      }),
      columnHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: (info) => {
          const student = info.row.original;
          return (
            <div className="flex items-center justify-end gap-1">
              <div className="flex items-center">
                <Link
                  href={`/instructor/summary/${student.id}`}
                  data-tooltip-id="student-actions-tooltip"
                  data-tooltip-content="View Summary"
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">
                    <FileText className="w-4 h-4" />
                  </Button>
                </Link>
                <Link
                  href={`/instructor/replay/${student.id}`}
                  data-tooltip-id="student-actions-tooltip"
                  data-tooltip-content="Replay Session"
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--primary))]">
                    <PlayCircle className="w-4 h-4" />
                  </Button>
                </Link>
              </div>
              <div className="w-px h-4 bg-[hsl(var(--border))] mx-1" />
              <div
                data-tooltip-id="student-actions-tooltip"
                data-tooltip-content="Delete Student Work"
              >
                <DeleteStudentSessionButton
                  sessionId={student.id}
                  studentName={student.participantToken}
                />
              </div>
            </div>
          );
        },
      }),
    ],
    []
  );

  const table = useReactTable({
    data: students,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: (updater) => {
      const nextSorting = typeof updater === 'function' ? updater(sorting) : updater;
      setSorting(nextSorting);
      if (nextSorting[0]) {
        setSortKey(`${nextSorting[0].id}:${nextSorting[0].desc ? 'desc' : 'asc'}`);
      }
    },
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: {
        pageSize: 20,
      },
    },
  });

  if (students.length === 0) {
    return (
      <div className="p-12 text-center">
        <div className="w-16 h-16 bg-[hsl(var(--muted))] rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-[hsl(var(--muted-foreground))]" />
        </div>
        <p className="text-[hsl(var(--muted-foreground))]">No students have started this assignment yet.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Search Bar */}
      <div className="p-4 border-b border-[hsl(var(--border))] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <Input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search students..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
          <span className="text-xs uppercase tracking-wide">Sort by</span>
          <select
            value={sortKey}
            onChange={(e) => {
              const value = e.target.value;
              setSortKey(value);
              const [id, direction] = value.split(':');
              setSorting([{ id, desc: direction === 'desc' }]);
            }}
            className="border border-[hsl(var(--border))] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
          >
            <option value="participantToken:asc">Participant (P-001 → ...)</option>
            <option value="participantToken:desc">Participant (... → P-001)</option>
            <option value="startedAt:desc">Started (Newest)</option>
            <option value="startedAt:asc">Started (Oldest)</option>
            <option value="lastSavedAt:desc">Last Active (Newest)</option>
            <option value="lastSavedAt:asc">Last Active (Oldest)</option>
            <option value="stats.submissions:desc">Submissions (High → Low)</option>
            <option value="stats.submissions:asc">Submissions (Low → High)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[hsl(var(--border))]">
          <thead className="bg-[hsl(var(--muted))]/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isSorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={`px-6 py-3 text-left text-xs font-medium text-[hsl(var(--muted-foreground))] uppercase tracking-wider ${header.column.getCanSort() ? 'cursor-pointer select-none hover:text-[hsl(var(--foreground))]' : ''
                        } ${header.id === 'actions' ? 'text-right' : ''}`}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={`flex items-center gap-2 ${header.id === 'actions' ? 'justify-end' : ''}`}>
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span
                            className={`text-[10px] font-semibold ${
                              isSorted
                                ? 'text-[hsl(var(--foreground))]'
                                : 'text-[hsl(var(--muted-foreground))]'
                            }`}
                            aria-hidden="true"
                          >
                            {isSorted === 'asc' ? '▲' : isSorted === 'desc' ? '▼' : '▵'}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-[hsl(var(--muted))]/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`px-6 py-4 whitespace-nowrap ${cell.column.id === 'actions' ? 'text-right' : ''
                      }`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-6 py-4 border-t border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-sm text-[hsl(var(--muted-foreground))]">
            Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} to{' '}
            {Math.min(
              (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
              table.getFilteredRowModel().rows.length
            )}{' '}
            of {table.getFilteredRowModel().rows.length} students
          </span>
          <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))] hidden sm:inline">Rows per page</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => {
                table.setPageSize(Number(e.target.value));
              }}
              className="border border-[hsl(var(--border))] rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
            >
              {[10, 20, 30, 50, 100].map((pageSize) => (
                <option key={pageSize} value={pageSize}>
                  {pageSize}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-[hsl(var(--foreground))] px-2">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="h-8 w-8"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tooltip
        id="student-actions-tooltip"
        place="top"
        style={{
          backgroundColor: 'hsl(var(--foreground))',
          color: 'hsl(var(--background))',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 50
        }}
        noArrow
      />
    </div>
  );
}
