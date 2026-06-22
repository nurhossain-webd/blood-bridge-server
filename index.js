import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [process.env.CLIENT_URL],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

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

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;

      const existingUser = await usersCollection.findOne({
        email: user.email,
      });

      if (existingUser) {
        return res.send({
          message: "User already exists",
          insertedId: null,
        });
      }

      const newUser = {
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        bloodGroup: user.bloodGroup,
        district: user.district,
        upazila: user.upazila,
        role: "donor",
        status: "active",
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      res.send(result);
    });

    app.get("/add-test-user", async (req, res) => {
      const testUser = {
        name: "Test User",
        email: "test@gmail.com",
        avatar: "https://i.ibb.co/test.png",
        bloodGroup: "A+",
        district: "Dhaka",
        upazila: "Dhanmondi",
        role: "donor",
        status: "active",
        createdAt: new Date(),
      };

      const existingUser = await usersCollection.findOne({
        email: testUser.email,
      });

      if (existingUser) {
        return res.send({
          message: "Test user already exists",
          user: existingUser,
        });
      }

      const result = await usersCollection.insertOne(testUser);
      res.send(result);
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