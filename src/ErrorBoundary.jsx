// No error boundary existed anywhere in this app before PAMS — any
// uncaught render error silently unmounts the whole React tree back to
// a blank <div id="root">, with nothing in the console explaining why.
// This wraps the whole app so a future crash is at least visible and
// diagnosable instead of a blank white screen.
import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Uncaught render error:", error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "monospace", whiteSpace: "pre-wrap", color: "#b00020" }}>
          <h2>Something went wrong.</h2>
          <div>{String(this.state.error?.message || this.state.error)}</div>
          <div style={{ marginTop: 12, fontSize: 12, color: "#555" }}>{this.state.error?.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
