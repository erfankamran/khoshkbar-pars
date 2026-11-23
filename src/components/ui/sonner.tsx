"use client"

import { Toaster as Sonner, ToasterProps } from "sonner"

// تم برنامه با ThemeBoot/پالت برند مدیریت می‌شود (بدون next-themes)؛ تم Toast همیشه روشن است.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
