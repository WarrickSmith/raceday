import { render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import RaceMeetings from "./RaceMeetings";

// Test rendering RaceMeetings element
describe("Unit Test renderings of <RaceMeetings /> element", () => {
  // Test rendering Spinner element while awaiting async result
  it("Renders Spinner Element correctly", async () => {
    render(<RaceMeetings />);
    const pageText = screen.getByText(/Fetching Meeting Info.../i);
    expect(pageText).toBeInTheDocument();
    const spinner = screen.getByTestId("spinner");
    expect(spinner).toBeInTheDocument();

    // time delay to allow RaceMeetings to fetch and render
    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, 3000);
        console.log(`Async Time Delay Finished in RaceMeetings element test`);
      });
    });
    // Check element has rendered
    const pageText2 = await screen.findByText(/Type/i);
    expect(pageText2).toBeInTheDocument();
  });
});
