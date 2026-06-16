import { Component, ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  message: string | null;
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { message: null };

  static getDerivedStateFromError(error: unknown): State {
    return {
      message: error instanceof Error ? error.message : "界面渲染异常",
    };
  }

  render() {
    if (this.state.message) {
      return (
        <main className="desktop">
          <section className="pad">
            <div className="handle"><span aria-hidden="true" /></div>
            <header className="top">
              <div className="bar">
                <div className="brand">
                  <h1>GlazePad</h1>
                  <span className="saved">界面渲染异常</span>
                </div>
              </div>
            </header>
            <section className="slot error-slot" aria-label="错误信息">
              <div className="content-box" role="alert">
                {this.state.message}
              </div>
            </section>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
