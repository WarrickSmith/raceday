import { render, screen } from "@testing-library/react";
import App from "./App";

// Test rendering main app web page routes
describe("<App />", () => {
  // Render Home page (default app page) - /home

  it("Renders default home page / (Home) correctly", () => {
    render(<App />);
    const pageText = screen.getByText(/RaceDay Analysis/i);
    expect(pageText).toBeInTheDocument();
  });

  // Render Live Racing page - /raceday

  // Render Race Data page - /racedata

  // Render About page - //about
});
