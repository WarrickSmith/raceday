import * as React from "React";
import { BrowserRouter as Router } from "react-router-dom";
import { render, screen, fireEvent, getByText } from "@testing-library/react";
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
    let result = screen.getByText(/Done!/i);
    expect(result).toBeTruthy();
    result = screen.getByText(/Home/i);
    expect(result).toBeTruthy();

    fireEvent.click(screen.getByText("Live Racing"));
    result = screen.getByText(/RaceDay/i);
    expect(result).toBeTruthy();
    console.log(result);
  });
});
