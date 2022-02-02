import { render, screen } from "@testing-library/react";
import RaceSelector from "./RaceSelector";
import { act } from "react-dom/test-utils";
import getAllRaces from "../../services/getAllRaces";

// Test rendering RaceMeetings element
describe("Unit Test rendering of <RaceSelector /> element", () => {
  jest.setTimeout(20000);
  // Test rendering RaceSelector element by looking for button text
  it("Renders RaceSelector Element correctly", async () => {
    const allRaces = await getAllRaces();
    render(
      <RaceSelector
        allRaces={allRaces}
        currentRace={0}
        setCurrentRace={() => {}}
      />
    );

    // time delay to allow RaceMeetings to fetch and render
    await act(async () => {
      await new Promise((r) => {
        setTimeout(r, 10000);
      });
    });
    const pageText = screen.getByText(/NEXT SCHEDULED RACE/i);
    expect(pageText).toBeInTheDocument();
  });
});
