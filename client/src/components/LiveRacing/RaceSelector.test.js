import { render, screen } from "@testing-library/react";
import RaceSelector from "./RaceSelector";

// Test rendering RaceMeetings element
describe("Unit Test rendering of <RaceSelector /> element", () => {
  jest.setTimeout(20000);
  // Test rendering Spinner element while awaiting async result
  it("Renders RaceSelector Element correctly", async () => {
    render(<RaceSelector />);
    const pageText = screen.getByText(/RaceSelector Element/i);
    expect(pageText).toBeInTheDocument();
    const spinner = screen.getByTestId("spinner");
    expect(spinner).toBeInTheDocument();
  });
});
