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
      orderBy: 'startTime'
    });

    const events = response.data.items;
   
    res.json({events});
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