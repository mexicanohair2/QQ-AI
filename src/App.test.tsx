import { render, screen } from "@testing-library/react";
import App from "./App";

describe("QQ AI application", () => {
  it("renders the application landmark and product title", () => {
    render(<App />);
    expect(screen.getByRole("main", { name: /qq ai/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "QQ AI" })).toBeInTheDocument();
  });
});
