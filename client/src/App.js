// Main RaceDay application page with routes to application sub pages

import { Routes, Route } from "react-router-dom";
import "./App.css";
import Header from "./components/Header";
import Home from "./pages/Home";
import Raceday from "./pages/Raceday";
import Racedata from "./pages/Racedata";
import About from "./pages/About";

function App() {
  return (
    <>
      <Header />
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
