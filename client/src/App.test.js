import { BrowserRouter as Router } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import App from "./App";

// Integration Test - rendering main app web page
describe("<App />", () => {
  // Render Home page (default app page) - /home

  it("Renders default home page / (Home) correctly", () => {
    render(
      <Router>
        <App />
      </Router>
    );

    // Check navigation bar has rendered
    let result = screen.getByText(/Home/i);
    expect(result).toBeTruthy();

    // Check default home page content has rendered
    result = screen.getByText(/RaceDay Info/i);
    expect(result).toBeTruthy();
  });
});
