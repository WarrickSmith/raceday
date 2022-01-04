// This is the main application home page

import { Link } from "react-router-dom";

function Home() {
  return (
    <>
      <main>
        <h2>RaceDay Analysis</h2>
      </main>
      <nav>
        <Link to="/about">About</Link>
      </nav>
    </>
  );
}

export default Home;
