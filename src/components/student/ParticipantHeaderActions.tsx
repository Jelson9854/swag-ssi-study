'use client';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { LogOut } from 'lucide-react';

interface ParticipantHeaderActionsProps {
    pid: string;
}

export default function ParticipantHeaderActions({ pid }: ParticipantHeaderActionsProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))] mr-2 hidden sm:inline-block">
                {pid}
            </span>

            {/* Logout */}
            <form action="/api/pid/logout" method="POST" className="inline-flex">
                <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="text-[hsl(var(--destructive))] hover:text-[hsl(var(--destructive))]/90 hover:bg-[hsl(var(--destructive))]/10"
                    data-tooltip-id="header-tooltip"
                    data-tooltip-content="Log out"
                >
                    <LogOut className="w-5 h-5" />
                </Button>
            </form>

            <Tooltip id="header-tooltip" place="bottom" className="z-50 !bg-[hsl(var(--popover))] !text-[hsl(var(--popover-foreground))] !border !border-[hsl(var(--border))] !rounded-md shadow-md text-xs px-2 py-1" />
        </div>
    );
}
