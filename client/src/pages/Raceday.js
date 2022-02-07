// This page is to show live race data for the current race day
import "../components/LiveRacing/LiveRacing";
import LiveRacing from "../components/LiveRacing/LiveRacing";

function Raceday() {
  return (
    <>
      <main className="raceday-container">
        <h2>RaceDay</h2>
        <LiveRacing />
      </main>
    </>
  );
}

export default Raceday;
