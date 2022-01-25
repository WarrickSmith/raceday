<!-- PROJECT LOGO -->
<br />
<p align="center">
  <a href="">
    <img src="client/src/logo.png" alt="Logo" width="98" height="138">
  </a>

  <h3 align="center">RACEDAY</h3>

  <p align="center">
    Australian TAB Live Racing Data review and historical data analysis
    <br />
    <br />
    <br />
  </p>
</p>

<!-- TABLE OF CONTENTS -->
<details open="open">
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgements">Acknowledgements</a></li>
    <li><a href="#raceday-api-server">RaceDay API Server</a></li>
  </ol>
</details>

<!-- ABOUT THE PROJECT -->

## About The Project

![Product Name Screen Shot][product-screenshot]

RaceDay is a client-server application to view live Australian TAB racing info and Historical Data.

Races are, (R)-Horse (Gallops), (H)-Harness (Trots) and (G)-Dogs (Greyhound).

The client (React) application connects to an API Server, which in turn interfaces to the TAB Corp API Server. Historical data is stored by the API Server in a No-SQL (Mongo) database (To Be Implemented).

### Built With

Key frameworks and technologies used in this project are:

- [Javascript / CSS / HTML](https://developer.mozilla.org) - Relevant to client and server components
- [React](https://reactjs.org/) - Main Client Application Code Base
- [Node](https://nodejs.org/) - Server Javascript application enviornment
- [MongoDb](https://www.mongodb.com/) - NoSQL database
- [Jest](https://jestjs.io/) - Testing enviornment
- [Sup[erTest](https://www.npmjs.com/package/supertest) - High-level abstraction for testing HTTP
- [Netlify](https://www.netlify.com/) - Web Site public hosting service

<!-- GETTING STARTED -->

## Getting Started

To get a local copy of the project up and running follow these simple steps.

### Prerequisites

To see full project functionality you will need the following as a prerequsite:

1. An account on stripe.com. This is to create and maintina your product catalog.
2. An account on begin.com. - This is to enable secure API integration with the strip.com product catalog and payments gateway.

### Installation

1. Get a API Keys from stripe.com
2. Clone the repo
   ```sh
   git clone https://github.com/your_username_/Project-Name.git
   ```
3. Install NPM packages
   ```sh
   npm install
   ```
4. Enter your stripe.com Public public in `.env.js`
   ```JS
   REACT_APP_STRIPE_PUBLIC_KEY=
   ```
5. log in to begin.com and enter your Secret Key from your stripe.com account.
6. Enter your begin.com deployed url `.env.js`

   ```JS
   REACT_APP_API_URL=
   ```

7. Log into stripe.com and add products that will be diplayed in the Top Hats shop catalog. Your must have a 'category' key.

<!-- USAGE EXAMPLES -->

## Usage

The Top Hats site will initially show featured products and then the first 6 products in the catelog. There is a close button to hide the featured products and page pagination at the bottom of the catelog to allow viewing more products.

Filter by category, Sort by and search product functionality is also included in a toolbar at the top of the screen to facilitate displaying products using a criteria.

Clicking a 'Buy now' button on either a featured product or catalog item will redirect the user to a third party payment provider and return them to Top Hats once the payment is complete.

A live version of the site has been deployed to: https://clever-knuth-5770a4.netlify.app/

The products and prices json data can be viewed at begin.com:

- Products: https://design-hc3-staging.begin.app/products

- Prices: https://design-hc3-staging.begin.app/prices

The Product Catalog can be viewed at:

- https://dashboard.stripe.com/test/products?active=true

(Note: you will need to be invited as a team member and will need to create an account if you do not have one)

<!-- ROADMAP -->

## Roadmap

Future functionaility will include ensuring the search functionality is not case sensative.

<!-- CONTACT -->

## Contact

Should you have any questions, the project team members are:

Warrick Smith - https://github.com/WarrickSmith

Project Link: [https://github.com/WarrickSmith/raceday]

<!-- ACKNOWLEDGEMENTS -->

## Acknowledgements

- [Tabcorp API Web Site 'TAB Studio'](https://www.studio.tab.com.au/)
- [favicon.io to geneate favicon.ico from a jpg](hhttps://favicon.io/favicon-converter/)
- [tinypng.com for reducing image sizes](https://tinypng.com/)
- [GitHub Pages](https://pages.github.com)

[product-screenshot]: public/thhome.png

<!-- RaceDay API Server -->

## RaceDay API Server

RaceDay API Overview

## API Endpoints

<details>
  <summary>Click to expand!</summary>
  
  ## Endpoints
  1. Method: GetMeetings
     * URL:     /getmeetings
     * Verb:    GET
    
  2. Samples  
     * REQUEST
     * RESPONSE
</details>
