import { Component, ErrorInfo, ReactNode } from 'react';
import FatalErrorScreen from './FatalErrorScreen';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  errorMessage: string;
  stackTrace: string;
  isChunkLoadError: boolean;
};

const CHUNK_ERROR_PATTERNS = [
  'Loading chunk',
  'ChunkLoadError',
  'Failed to fetch dynamically imported module',
];

const isChunkLoadError = (message: string) => {
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
};

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    stackTrace: '',
    isChunkLoadError: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const message = error?.message ?? 'Unknown error';

    return {
      hasError: true,
      errorMessage: message,
      isChunkLoadError: isChunkLoadError(message),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const message = error?.message ?? 'Unknown error';
    const combinedStack = [error?.stack, errorInfo?.componentStack].filter(Boolean).join('\n\n');

    this.setState({
      hasError: true,
      errorMessage: message,
      stackTrace: combinedStack,
      isChunkLoadError: isChunkLoadError(message),
    });

    console.error('Global ErrorBoundary caught an error', error, errorInfo);
  }

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <FatalErrorScreen
        errorMessage={this.state.errorMessage}
        stackTrace={this.state.stackTrace}
        isChunkLoadError={this.state.isChunkLoadError}
      />
    );
  }
}
