// This component will return an Element to select a race from todays races

// Import dependancies
import "./RaceSelector.css";

// Render Element
const RaceSelector = ({ allRaces }) => {
  console.log(`RaceSelector Element Loading...`);
  // Event handler for selecting different race from dropdown list
  const handleOnChange = (event) => {
    console.log(`A change has been detected!`);
    console.log(`event.target.value: `, event.target.value);
    setCurrentRace(event.target.value);
  };

  // Event handler for clicking on 'NEXT SCHEDULED RACE'
  const handleOnClick = () => {
    console.log(`A click event has been detected!`);
    setCurrentRace(getNextRace(raceList));
  };

  // Event handler for clicking on '<<' decrease race by one
  const handleOnClickMinus = () => {
    if (currentRace > 0) {
      setCurrentRace((prevCount) => prevCount - 1);
    }
  };

  // Event handler for clicking on '>>' increase race by one
  const handleOnClickPlus = () => {
    const numberOfRaces = raceList.length;
    if (currentRace < numberOfRaces - 1) {
      setCurrentRace((prevCount) => prevCount + 1);
    }
  };

  // Testing element functionailty
  // console.log(
  //   `Current Active Race: `,
  //   currentRace,
  //   `  |   Next Schedlued Race: `,
  //   getNextRace(raceList)
  // );

  return (
    <>
      <div className="raceselector">
        {allRaces && (
          <select
            className="race-select-textbox"
            id="raceList"
            name="raceList"
            value={0}
            // onChange={handleOnChange}
          >
            {allRaces.map((race, index) => (
              <option
                key={index + race.RaceName + race.RaceNumber}
                value={index}
              >
                {`${new Date(race.RaceStartTime).toLocaleString("en-nz", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })} - Race ${race.RaceNumber} @ ${race.MeetingName} (${
                  race.RaceType
                })`}
              </option>
            ))}
          </select>
        )}
        <div className="selector-buttons">
          <button
            className="button-minus"
            // onClick={handleOnClickMinus}
          >{`<<`}</button>
          <button
            className="button-next"
            // onClick={handleOnClick}
          >
            NEXT SCHEDULED RACE
          </button>
          <button
            className="button-plus"
            // onClick={handleOnClickPlus}
          >{`>>`}</button>
        </div>
      </div>
    </>
  );
};
export default RaceSelector;
