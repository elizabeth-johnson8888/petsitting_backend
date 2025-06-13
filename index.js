// index.js
const express = require("express");
const cors = require("cors");
const axios = require('axios');
const { google } = require("googleapis");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

const auth = new google.auth.GoogleAuth({
  keyFile: "service-account.json",
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

app.get("/busy-dates", async (req, res) => {
  try {
    const authClient = await auth.getClient();
    const calendar = google.calendar({ version: "v3", auth: authClient });

    const calendarId = process.env.CALENDAR_ID;
    const now = new Date();
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);

    const response = await calendar.events.list({
      calendarId,
      timeMin: now.toISOString(),
      timeMax: threeMonthsFromNow.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items;

    // Group events by date
    const grouped = {};

    events.forEach(event => {
      let dateKey;
      let isAllDay = false;

      if (event.start.dateTime) {
        dateKey = new Date(event.start.dateTime).toDateString();
      } else if (event.start.date) {
        dateKey = new Date(event.start.date).toDateString();
        isAllDay = true;
      } else {
        return; // skip invalid event
      }

      if (!grouped[dateKey]) {
        grouped[dateKey] = {
          timed: [],
          allDay: [],
        };
      }

      if (isAllDay) {
        grouped[dateKey].allDay.push(event);
      } else {
        grouped[dateKey].timed.push(event);
      }
    });

    // Determine unavailable dates
    const unavailableDates = [];

    for (const [dateStr, eventsByType] of Object.entries(grouped)) {
      const timedCount = eventsByType.timed.length;
      const allDayHouseSit = eventsByType.allDay.some(e => e.summary?.toLowerCase().includes("house-sit"));
      const hasDropIn = eventsByType.timed.some(e => e.summary?.toLowerCase().includes("drop-in"));

      if (
        timedCount >= 4 ||
        (allDayHouseSit && hasDropIn)
      ) {
        unavailableDates.push(new Date(dateStr));
      }
    }

    res.json(unavailableDates);
  } catch (error) {
    console.error("Error fetching busy dates:", error);
    res.status(500).send("Failed to fetch busy dates");
  }
});

app.get('/reviews', async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_TOKEN}`,
        },
      }
    );

    const formatted = response.data.records.map(record => ({
      name: record.fields.Name,
      review: record.fields.Review,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching from Airtable:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

app.post("/submit-review", async (req, res) => {
  const { code, name, review } = req.body;

  try {
    // 1. Validate the code
    const codeRes = await axios.get(
      `https://api.airtable.com/v0/${process.env.CODE_BASE_ID}/${process.env.CODE_TABLE_NAME}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CODE_API_TOKEN}`,
        },
      }
    );

    const match = codeRes.data.records.find(
      (r) => r.fields.Code?.trim() === code.trim()
    );

    if (!match) {
      return res.status(400).json({ success: false, message: "Invalid code" });
    }

    // 2. Delete the used code
    await axios.delete(
      `https://api.airtable.com/v0/${process.env.CODE_BASE_ID}/${process.env.CODE_TABLE_NAME}/${match.id}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CODE_API_TOKEN}`,
        },
      }
    );

    // 3. Submit the review
    await axios.post(
      `https://api.airtable.com/v0/${process.env.REVIEW_BASE_ID}/${process.env.REVIEW_TABLE_NAME}`,
      {
        fields: {
          Name: name,
          Review: review,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.REVIEW_API_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Error submitting review:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});