import { BrowserRouter as Router } from "react-router-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import App from "../App";

// Integration Test - navbar rendering and Routes
describe("Component - Navbar />", () => {
  // Render navbar

  it("Renders default home page / (Home) correctly with Navbar", async () => {
    await render(
      <Router>
        <App />
      </Router>
    );

    // Check all navigation bar linkable elements have rendered
    let result = screen.getByText(/Home/i);
    expect(result).toBeTruthy();
    result = screen.getByText(/Live Racing/i);
    expect(result).toBeTruthy();
    result = screen.getByText(/Race Data/i);
    expect(result).toBeTruthy();
    result = screen.getByText(/About/i);
    expect(result).toBeTruthy();

    // Check Home Page has rendered
    result = screen.getByText(/RaceDay Analysis/i);
    expect(result).toBeTruthy();
  });

  // check Navbar functionality by clicking links and verifying route render correct pages
  it("Renders pages correcly when nav links clicked", async () => {
    await render(
      <Router>
        <App />
      </Router>
    );

    // Check Navbar interaction by clicking on links and checking content on rendered page
    // Raceday Page
    await fireEvent.click(screen.getByText("Live Racing"));
    let result = screen.getByText(/RaceDay/i);
    expect(result).toBeTruthy();
    // Racedata Page
    await fireEvent.click(screen.getByText("Race Data"));
    result = screen.getByText(/RaceData/i);
    expect(result).toBeTruthy();
    // About Page
    await fireEvent.click(screen.getByText("About"));
    result = screen.getByText(/Who are we?/i);
    expect(result).toBeTruthy();
    // Home Page - click back to /Home
    await fireEvent.click(screen.getByText("Home"));
    result = screen.getByText(/RaceDay Analysis/i);
    expect(result).toBeTruthy();
  });
});
