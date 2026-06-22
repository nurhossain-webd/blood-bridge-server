import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

dotenv.config();

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
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

    app.get("/", (req, res) => {
      res.send("BloodBridge server is running");
    });

    app.get("/health", async (req, res) => {
      const result = await client.db("admin").command({ ping: 1 });
      res.send({ message: "MongoDB connected successfully", result });
    });

    app.get("/users", async (req, res) => {
      const users = await usersCollection.find().toArray();
      res.send(users);
    });

    app.get("/users/:email", async (req, res) => {
      const user = await usersCollection.findOne({ email: req.params.email });
      res.send(user);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const existingUser = await usersCollection.findOne({ email: user.email });

      if (existingUser) {
        return res.send({ message: "User already exists", insertedId: null });
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

    app.patch("/users/:email", async (req, res) => {
      const updatedData = req.body;

      const result = await usersCollection.updateOne(
        { email: req.params.email },
        {
          $set: {
            name: updatedData.name,
            avatar: updatedData.avatar,
            bloodGroup: updatedData.bloodGroup,
            district: updatedData.district,
            upazila: updatedData.upazila,
            updatedAt: new Date(),
          },
        }
      );

      res.send(result);
    });

    app.post("/donation-requests", async (req, res) => {
      const requestData = req.body;

      const requester = await usersCollection.findOne({
        email: requestData.requesterEmail,
      });

      if (!requester) {
        return res.status(404).send({ message: "Requester not found" });
      }

      if (requester.status === "blocked") {
        return res.status(403).send({
          message: "Blocked user cannot create donation request",
        });
      }

      const newRequest = {
        requesterName: requestData.requesterName,
        requesterEmail: requestData.requesterEmail,
        recipientName: requestData.recipientName,
        recipientDistrict: requestData.recipientDistrict,
        recipientUpazila: requestData.recipientUpazila,
        hospitalName: requestData.hospitalName,
        fullAddress: requestData.fullAddress,
        bloodGroup: requestData.bloodGroup,
        donationDate: requestData.donationDate,
        donationTime: requestData.donationTime,
        requestMessage: requestData.requestMessage,
        donationStatus: "pending",
        donorName: "",
        donorEmail: "",
        createdAt: new Date(),
      };

      const result = await donationRequestsCollection.insertOne(newRequest);
      res.send(result);
    });

    app.get("/donation-requests", async (req, res) => {
      const { email, status } = req.query;
      const query = {};

      if (email) query.requesterEmail = email;
      if (status) query.donationStatus = status;

      const result = await donationRequestsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      res.send(result);
    });

    app.get("/donation-requests/:id", async (req, res) => {
      const result = await donationRequestsCollection.findOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.patch("/donation-requests/:id", async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            recipientName: updatedData.recipientName,
            recipientDistrict: updatedData.recipientDistrict,
            recipientUpazila: updatedData.recipientUpazila,
            hospitalName: updatedData.hospitalName,
            fullAddress: updatedData.fullAddress,
            bloodGroup: updatedData.bloodGroup,
            donationDate: updatedData.donationDate,
            donationTime: updatedData.donationTime,
            requestMessage: updatedData.requestMessage,
            updatedAt: new Date(),
          },
        }
      );

      res.send(result);
    });

    app.delete("/donation-requests/:id", async (req, res) => {
      const result = await donationRequestsCollection.deleteOne({
        _id: new ObjectId(req.params.id),
      });

      res.send(result);
    });

    app.patch("/donation-requests/status/:id", async (req, res) => {
      const { status } = req.body;

      const result = await donationRequestsCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: {
            donationStatus: status,
            updatedAt: new Date(),
          },
        }
      );

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