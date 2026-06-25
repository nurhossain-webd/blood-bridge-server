import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";
import Stripe from "stripe";

dotenv.config();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5001;

const allowedOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  process.env.CLIENT_URL,
].filter(Boolean);

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

const createJwtToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      role: user.role,
      status: user.status,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const verifyToken = (req, res, next) => {
  const token =
    req.cookies?.access_token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) {
      return res.status(401).send({ message: "Invalid or expired token" });
    }

    req.user = decoded;
    next();
  });
};

const client = new MongoClient(process.env.MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db;
let usersCollection;
let donationRequestsCollection;
let fundsCollection;

async function connectDB() {
  if (db) return;

  await client.connect();

  db = client.db("bloodBridgeDB");
  usersCollection = db.collection("users");
  donationRequestsCollection = db.collection("donationRequests");
  fundsCollection = db.collection("funds");

  console.log("MongoDB connected successfully");
}

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("MongoDB connection error:", error);
    res.status(500).send({ message: "Database connection failed" });
  }
});

app.get("/", (req, res) => {
  res.send("BloodBridge server is running");
});

app.post("/jwt", async (req, res) => {
  const { email } = req.body;

  const user = await usersCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  const token = createJwtToken(user);

  res.send({
    success: true,
    token,
  });
});

app.post("/logout", (req, res) => {
  res.send({ success: true });
});

app.get("/dashboard-stats", verifyToken, async (req, res) => {
  const totalUsers = await usersCollection.countDocuments();
  const totalDonationRequests =
    await donationRequestsCollection.countDocuments();

  const funds = await fundsCollection.find().toArray();
  const totalFunding = funds.reduce(
    (sum, fund) => sum + Number(fund.amount || 0),
    0
  );

  res.send({
    totalUsers,
    totalDonationRequests,
    totalFunding,
  });
});

app.get("/users", verifyToken, async (req, res) => {
  const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(users);
});

app.get("/donors/search", async (req, res) => {
  const { bloodGroup, district, upazila } = req.query;

  const query = {
    role: "donor",
    status: "active",
  };

  if (bloodGroup) query.bloodGroup = bloodGroup;
  if (district) query.district = district;
  if (upazila) query.upazila = upazila;

  const donors = await usersCollection
    .find(query)
    .project({
      name: 1,
      email: 1,
      avatar: 1,
      bloodGroup: 1,
      district: 1,
      upazila: 1,
    })
    .toArray();

  res.send(donors);
});

app.get("/users/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (req.user.email !== email && req.user.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const user = await usersCollection.findOne({ email });
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

app.patch("/users/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  if (req.user.email !== email && req.user.role !== "admin") {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const updatedData = req.body;

  const result = await usersCollection.updateOne(
    { email },
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

app.patch("/users/role/:id", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).send({ message: "Admin only access" });
  }

  const { role } = req.body;

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { role, updatedAt: new Date() } }
  );

  res.send(result);
});

app.patch("/users/status/:id", verifyToken, async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(403).send({ message: "Admin only access" });
  }

  const { status } = req.body;

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { status, updatedAt: new Date() } }
  );

  res.send(result);
});

app.post("/donation-requests", verifyToken, async (req, res) => {
  const requestData = req.body;

  if (req.user.email !== requestData.requesterEmail) {
    return res.status(403).send({ message: "Forbidden access" });
  }

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
  const { email, status, limit } = req.query;
  const query = {};

  if (email) query.requesterEmail = email;
  if (status) query.donationStatus = status;

  let cursor = donationRequestsCollection.find(query).sort({ createdAt: -1 });

  if (limit) {
    cursor = cursor.limit(Number(limit));
  }

  const result = await cursor.toArray();
  res.send(result);
});

app.get("/donation-requests/:id", async (req, res) => {
  const result = await donationRequestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

app.patch("/donation-requests/:id", verifyToken, async (req, res) => {
  const request = await donationRequestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!request) {
    return res.status(404).send({ message: "Donation request not found" });
  }

  if (req.user.role !== "admin" && req.user.email !== request.requesterEmail) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const updatedData = req.body;

  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
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

app.patch("/donation-requests/donate/:id", verifyToken, async (req, res) => {
  const { donorName, donorEmail } = req.body;

  if (req.user.email !== donorEmail) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const request = await donationRequestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!request) {
    return res.status(404).send({ message: "Donation request not found" });
  }

  if (request.donationStatus !== "pending") {
    return res.status(400).send({
      message: "This request is not available for donation",
    });
  }

  const result = await donationRequestsCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    {
      $set: {
        donationStatus: "inprogress",
        donorName,
        donorEmail,
        updatedAt: new Date(),
      },
    }
  );

  res.send(result);
});

app.delete("/donation-requests/:id", verifyToken, async (req, res) => {
  const request = await donationRequestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!request) {
    return res.status(404).send({ message: "Donation request not found" });
  }

  if (req.user.role !== "admin" && req.user.email !== request.requesterEmail) {
    return res.status(403).send({ message: "Forbidden access" });
  }

  const result = await donationRequestsCollection.deleteOne({
    _id: new ObjectId(req.params.id),
  });

  res.send(result);
});

app.patch("/donation-requests/status/:id", verifyToken, async (req, res) => {
  const { status } = req.body;

  const request = await donationRequestsCollection.findOne({
    _id: new ObjectId(req.params.id),
  });

  if (!request) {
    return res.status(404).send({ message: "Donation request not found" });
  }

  const allowed =
    req.user.role === "admin" ||
    req.user.role === "volunteer" ||
    req.user.email === request.requesterEmail;

  if (!allowed) {
    return res.status(403).send({ message: "Forbidden access" });
  }

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

app.post("/create-payment-intent", verifyToken, async (req, res) => {
  const { amount } = req.body;

  if (!amount || Number(amount) < 1) {
    return res.status(400).send({ message: "Invalid amount" });
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Number(amount) * 100,
    currency: "eur",
    payment_method_types: ["card"],
  });

  res.send({
    clientSecret: paymentIntent.client_secret,
  });
});

app.post("/funds", verifyToken, async (req, res) => {
  const fund = req.body;

  const newFund = {
    name: fund.name,
    email: fund.email,
    amount: Number(fund.amount),
    transactionId: fund.transactionId,
    fundingDate: new Date(),
  };

  const result = await fundsCollection.insertOne(newFund);
  res.send(result);
});

app.get("/funds", verifyToken, async (req, res) => {
  const funds = await fundsCollection
    .find()
    .sort({ fundingDate: -1 })
    .toArray();

  res.send(funds);
});

if (process.env.NODE_ENV !== "production") {
  app.listen(port, () => {
    console.log(`BloodBridge server is running on port ${port}`);
  });
}

export default app;