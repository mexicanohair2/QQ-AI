import type { PropsWithChildren } from "react";
import { render } from "@testing-library/react";

export function renderApp(ui: React.ReactElement, options = {}) {
  return render(ui, options);
}

export function TestWrapper({ children }: PropsWithChildren) {
  return <>{children}</>;
}
