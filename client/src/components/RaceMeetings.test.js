import { render, screen } from "@testing-library/react";
import RaceMeetings from "./RaceMeetings";

// Test rendering main app web page routes
describe("Unit Test renderings of <RaceMeetings /> element", () => {
  // Render Home page (default app page) - /home
  it("Renders RaceMeetings Element correctly", () => {
    render(<RaceMeetings />);
    const pageText = screen.getByText(/Done!/i);
    expect(pageText).toBeInTheDocument();
  });
});
