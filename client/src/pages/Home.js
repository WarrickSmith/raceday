// This is the main application home page

import { Link } from "react-router-dom";
import RaceMeetings from "../components/RaceMeetings";

function Home() {
  return (
    <>
      <main>
        <h2>RaceDay Analysis</h2>
        <RaceMeetings />
      </main>
      <nav>
        <Link to="/about">About</Link>
      </nav>
    </>
  );
}

export default Home;
