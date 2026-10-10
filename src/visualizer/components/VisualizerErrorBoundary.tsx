import { Component, type ReactNode } from "react";

type Props = { children: ReactNode; open: boolean; onClose(): void; failedLabel: string; retryLabel: string; closeLabel: string };
export class VisualizerErrorBoundary extends Component<Props, { failed: boolean; epoch: number }> {
  state = { failed: false, epoch: 0 };
  static getDerivedStateFromError(): { failed: boolean } { return { failed: true }; }
  componentDidCatch(error: Error): void { console.error("[visualizer] initialization-failed", error.message); }
  render(): ReactNode {
    if (this.state.failed) return this.props.open ? <section className="visualizer-window visualizer-boundary" role="region" aria-label={this.props.failedLabel}><div role="alert"><p>{this.props.failedLabel}</p><button onClick={() => this.setState(state => ({ failed: false, epoch: state.epoch + 1 }))} type="button">{this.props.retryLabel}</button><button onClick={this.props.onClose} type="button">{this.props.closeLabel}</button></div></section> : null;
    return <div key={this.state.epoch}>{this.props.children}</div>;
  }
}
