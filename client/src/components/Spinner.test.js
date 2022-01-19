import { render, screen } from "@testing-library/react";
import Spinner from "./Spinner";

// Test rendering Spinner element
describe("Unit Test rendering of <Spinners /> element", () => {
  // Render Home page (default app page) - /home
  it("Renders Spinner Element correctly", async () => {
    render(<Spinner />);
    const spinner = screen.getByTestId("spinner");
    expect(spinner).toBeInTheDocument();
  });
});
