'use client';

import Link from 'next/link';
import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';

interface DashboardHeaderActionsProps {
    email: string;
}

export default function DashboardHeaderActions({ email }: DashboardHeaderActionsProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-sm text-[hsl(var(--muted-foreground))] mr-2">{email}</span>

            <Link
                href="/student/settings"
                className="inline-flex items-center justify-center rounded-full w-10 h-10 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-colors"
                data-tooltip-id="dashboard-tooltip"
                data-tooltip-content="Settings"
                aria-label="Settings"
            >
                <Settings className="w-5 h-5" />
            </Link>

            <form action="/api/auth/logout" method="POST">
                <Button
                    type="submit"
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    data-tooltip-id="dashboard-tooltip"
                    data-tooltip-content="Log out"
                    aria-label="Log out"
                >
                    <LogOut className="w-5 h-5" />
                </Button>
            </form>

            <Tooltip
                id="dashboard-tooltip"
                place="bottom"
                style={{
                    backgroundColor: 'hsl(var(--foreground))',
                    color: 'hsl(var(--background))',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px'
                }}
                noArrow
            />
        </div>
    );
}
