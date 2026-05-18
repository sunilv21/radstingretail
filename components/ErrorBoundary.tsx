'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** Optional render override. Receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render-phase exceptions in any child component subtree and shows a
 * recoverable error card instead of an unmounted app. Network/async errors
 * still surface via the toaster (sonner) — this boundary is for the rare
 * cases where bad server data or a coding bug throws during render.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (typeof window !== 'undefined') {
      // Surface in the dev console so the stack is one click away.
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary]', error, info)
    }
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-4">
        <div className="max-w-md w-full rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-6 text-center space-y-3">
          <div className="flex justify-center">
            <AlertTriangle className="w-10 h-10 text-rose-600" />
          </div>
          <h2 className="text-lg font-semibold text-rose-900 dark:text-rose-200">
            Something went wrong on this page
          </h2>
          <p className="text-sm text-rose-800 dark:text-rose-300 break-words">
            {error.message || 'An unexpected error occurred while rendering.'}
          </p>
          <p className="text-[11px] text-rose-700 dark:text-rose-400">
            The rest of the app is fine — you can retry this page or jump elsewhere
            via the sidebar.
          </p>
          <div className="flex gap-2 justify-center pt-1">
            <Button
              size="sm"
              variant="outline"
              onClick={this.reset}
            >
              <RefreshCcw className="w-3.5 h-3.5 mr-1" /> Try again
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
            >
              Reload page
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
