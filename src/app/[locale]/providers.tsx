'use client'

import { useEffect } from "react"
import { SessionProvider } from "next-auth/react"
import { ToastProvider } from "@/contexts/ToastContext"
import { QueryProvider } from "@/components/providers/QueryProvider"

function isIgnoredExtensionError(input: {
  message?: string | null
  filename?: string | null
  stack?: string | null
}) {
  const message = (input.message || "").toLowerCase()
  const filename = (input.filename || "").toLowerCase()
  const stack = (input.stack || "").toLowerCase()

  const fromExtension =
    filename.startsWith("chrome-extension://")
    || stack.includes("chrome-extension://")

  if (!fromExtension) return false

  return message.includes("origin not allowed")
}

function DevExtensionErrorFilter() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return

    const onError = (event: ErrorEvent) => {
      if (!isIgnoredExtensionError({
        message: event.message,
        filename: event.filename,
        stack: event.error instanceof Error ? event.error.stack : null,
      })) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation?.()
    }

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      const message =
        typeof reason === "string"
          ? reason
          : reason && typeof reason === "object" && "message" in reason
            ? String((reason as { message?: unknown }).message || "")
            : ""
      const stack =
        reason instanceof Error
          ? reason.stack || null
          : reason && typeof reason === "object" && "stack" in reason
            ? String((reason as { stack?: unknown }).stack || "")
            : null

      if (!isIgnoredExtensionError({ message, stack })) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation?.()
    }

    window.addEventListener("error", onError, true)
    window.addEventListener("unhandledrejection", onUnhandledRejection, true)

    return () => {
      window.removeEventListener("error", onError, true)
      window.removeEventListener("unhandledrejection", onUnhandledRejection, true)
    }
  }, [])

  return null
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchInterval={0}
    >
      <DevExtensionErrorFilter />
      <QueryProvider>
        <ToastProvider>
          {children}
        </ToastProvider>
      </QueryProvider>
    </SessionProvider>
  )
}
