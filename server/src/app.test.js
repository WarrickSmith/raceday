// Integration tests for API endpoints

const request = require("supertest");
const app = require("./app");

describe("app.js integration tests:", () => {
  // Test for all Race Meetings happy path
  it("Should get all /racemeetings", async () => {
    const expectedStatus = 200;
    await request(app)
      .get("/racemeetings")
      .expect(expectedStatus)
      .expect((response) => {
        const body = response.body;
        expect(body).toHaveProperty("meetings[0].meetingName");
      });
  });
});
