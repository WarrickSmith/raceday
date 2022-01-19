import { render, screen } from "@testing-library/react";
import RaceMeetings from "./RaceMeetings";

// Test rendering RaceMeetings element
describe("Unit Test renderings of <RaceMeetings /> element", () => {
  // Render Home page (default app page) - /home
  it("Renders RaceMeetings Element correctly", () => {
    render(<RaceMeetings />);
    const pageText = screen.getByText(/Done!/i);
    expect(pageText).toBeInTheDocument();
  });
});
