import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"

interface EmptyStateCardProps {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  action?: React.ReactNode
  minHeightClass?: string
  className?: string
  contentClassName?: string
  titleClassName?: string
  descriptionClassName?: string
  iconWrapperClassName?: string
  actionWrapperClassName?: string
}

const joinClasses = (...classes: Array<string | undefined>) => classes.filter(Boolean).join(" ")

export default function EmptyStateCard({
  title,
  description,
  icon,
  action,
  minHeightClass = "min-h-[160px]",
  className,
  contentClassName,
  titleClassName,
  descriptionClassName,
  iconWrapperClassName,
  actionWrapperClassName,
}: EmptyStateCardProps) {
  return (
    <Card className={joinClasses(minHeightClass, className)}>
      <CardContent
        className={joinClasses(
          "flex h-full flex-col items-center justify-center text-center !p-6",
          minHeightClass,
          contentClassName
        )}
      >
        {icon ? (
          <div className={joinClasses("mb-4 rounded-full bg-[hsl(var(--muted))] p-4", iconWrapperClassName)}>
            {icon}
          </div>
        ) : null}
        <h3 className={joinClasses("text-lg font-medium text-[hsl(var(--foreground))]", titleClassName)}>
          {title}
        </h3>
        {description ? (
          <p className={joinClasses("mt-1 text-[hsl(var(--muted-foreground))]", descriptionClassName)}>
            {description}
          </p>
        ) : null}
        {action ? (
          <div className={joinClasses("mt-6", actionWrapperClassName)}>
            {action}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
