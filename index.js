const { MongoClient, ServerApiVersion } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    const db = client.db("hireloop_db");
    const jobsCollection = db.collection("jobs");
    const companiesCollection = db.collection("companies");

    app.get("/api/companies/:userId", async (req, res) => {
      const userId = req.params.userId;
      const company = await companiesCollection.findOne({ userId: userId });
      const companyInfo = company || {};
      res.send(companyInfo);
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      console.log(company);
      const result = await companiesCollection.insertOne(company);
      res.send(result);
    })

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      console.log(job);
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    });

    app.get("/api/jobs", async (req, res) => {
      const query = {};
      if (req.query.companyId) {
        query.companyId = req.query.companyId;
      }
      if (req.query.status) {
        query.status = req.query.status;
      }
      const cursor = jobsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
