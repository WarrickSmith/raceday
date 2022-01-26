import { render, screen } from "@testing-library/react";
import { act } from "react-dom/test-utils";
import LiveRacing from "./LiveRacing";

// Test rendering RaceMeetings element
describe("Unit Test rendering of <RaceDay /> element", () => {
  jest.setTimeout(20000);
  // Test rendering Spinner element while awaiting async result
  it("Renders LiveRacing Element correctly", async () => {
    render(<LiveRacing />);
    const pageText = screen.getByText(/LiveRacing Element/i);
    expect(pageText).toBeInTheDocument();
    const spinner = screen.getByTestId("spinner");
    expect(spinner).toBeInTheDocument();

    // time delay to allow RaceMeetings to fetch and render
    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, 10000);
        console.log(`Async Time Delay Finished in RaceMeetings element test`);
      });
    });
    // Check element has rendered
    const pageText2 = await screen.findByText(/Type/i);
    expect(pageText2).toBeInTheDocument();
  });
});
