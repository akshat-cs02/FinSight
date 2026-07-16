import React, { Component, ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: (error: Error, reset: () => void) => ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  reset = () => this.setState({ hasError: false, error: null })

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset)
      return (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-red-200 flex items-start gap-3 my-4">
          <AlertCircle className="text-red-400 mt-0.5 flex-shrink-0" size={20} />
          <div className="flex-1">
            <p className="font-semibold mb-1">Something went wrong rendering this view.</p>
            <p className="text-sm text-red-300/80 mb-3">{this.state.error.message}</p>
            <button
              onClick={this.reset}
              className="text-xs px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 rounded text-red-100 transition"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
