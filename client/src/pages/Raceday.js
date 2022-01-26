// This page is to show live race data for the current race day
import "../components/RaceDay/LiveRacing";
import LiveRacing from "../components/RaceDay/LiveRacing";

function Raceday() {
  return (
    <>
      <main className="home-container">
        <h2>RaceDay</h2>
        <LiveRacing />
      </main>
    </>
  );
}

export default Raceday;
