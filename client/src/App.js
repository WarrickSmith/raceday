// Main RaceDay application page with routes to application sub pages

import { Routes, Route } from "react-router-dom";

// Import modules used for navigation header and page routing
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Raceday from "./pages/Raceday";
import Racedata from "./pages/Racedata";
import Races from "./pages/Races";
import About from "./pages/About";

function App() {
  console.log("App Component Rendered");
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="raceday" element={<Raceday />} />
        <Route path="racedata" element={<Racedata />} />
        <Route path="about" element={<About />} />
        <Route path="races/:url" element={<Races />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}

export default App;
