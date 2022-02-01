import { render, screen } from "@testing-library/react";
import RaceData from "./RaceData";

// Test rendering RaceData element
describe("Unit Test rendering of <RaceData /> element", () => {
  jest.setTimeout(20000);
  // Test rendering RaceData element by looking for  text
  it("Renders RaceData Element correctly", async () => {
    render(<RaceData />);
    const pageText = screen.getByText(/Awaiting RaceData.../i);
    expect(pageText).toBeInTheDocument();
  });
});
