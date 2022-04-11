// Main API Server application end point definitions. Note endpoint functionality is typically contained in a seperate module and referenced (required)
const express = require("express");
var cors = require("cors");
const app = express();
const errorHandlerMiddleware = require("./middleware/errorHandlerMiddleware");

// Raceday router
const racedayRouter = require("./racing/raceday.router");

// API Server Swagger Route
const path = require("path");
const yaml = require("js-yaml");
const fs = require("fs");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = yaml.load(
  fs.readFileSync(path.join(__dirname, "../apispec.yaml"), "utf8")
);

// middleware
app.use(cors()); // Prevent CORS error on client web browser
app.use(express.json());

// routes
app.use("/api", racedayRouter);

// Swagger API Server Route
app.use("/", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Error Handling
app.use(errorHandlerMiddleware);

module.exports = app;
