// Main RaceDay application page with routes to application sub pages

import { Routes, Route } from "react-router-dom";
import "./App.css";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import Raceday from "./pages/Raceday";
import Racedata from "./pages/Racedata";
import About from "./pages/About";

function App() {
  console.log("App Component Rendered");
  return (
    <>
      <Navbar />
      <div className="App">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="raceday" element={<Raceday />} />
          <Route path="racedata" element={<Racedata />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
