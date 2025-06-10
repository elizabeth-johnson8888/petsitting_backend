// index.js
const express = require("express");
const cors = require("cors");
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(cors());

const PORT = process.env.PORT || 8080;

const auth = new google.auth.GoogleAuth({
  keyFile: "service-account.json",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

app.get("/busy-dates", async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: "v3", auth: authClient });

    const result = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date().toISOString(),
        timeMax: new Date(new Date().setMonth(new Date().getMonth() + 3)).toISOString(),
        items: [{ id: process.env.CALENDAR_ID }],
      },
    });

    const busyDates = result.data.calendars[process.env.CALENDAR_ID].busy;
    res.json(busyDates);
  } catch (error) {
    console.error("Error fetching busy dates:", error);
    res.status(500).send("Failed to fetch busy dates");
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});