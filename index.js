import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

// MongoDB client
const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("bloodBridgeDB");

    const usersCollection = db.collection("users");
    const donationRequestsCollection = db.collection("donationRequests");
    const fundsCollection = db.collection("funds");

    app.get("/", (req, res) => {
      res.send("BloodBridge server is running");
    });

    app.get("/health", async (req, res) => {
      const result = await client.db("admin").command({ ping: 1 });

      res.send({
        message: "MongoDB connected successfully",
        result,
      });
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run();

app.listen(port, () => {
  console.log(`BloodBridge server is running on port ${port}`);
});