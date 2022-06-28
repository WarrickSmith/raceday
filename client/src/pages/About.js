// This page is for information about the application and developer

function About() {
  return (
    <>
      <main>
        <h2>About The Project</h2>
        <p>
          RaceDay is a client-server application to view live Australian TAB
          racing info and Historical Data. Races are, (R)-Horse (Gallops),
          (H)-Harness (Trots) and (G)-Dogs (Greyhound). The client (React)
          application connects to an API Server, which in turn interfaces to the
          TAB Corp API Server. Historical data is stored by the API Server in a
          No-SQL (Mongo) database (To Be Implemented).
        </p>
      </main>
    </>
  );
}

export default About;
