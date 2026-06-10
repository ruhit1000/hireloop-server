const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
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
    const usersCollection = db.collection("user");
    const applicationsCollection = db.collection("applications");
    const plansCollection = db.collection("plans");
    const subscriptionsCollection = db.collection("subscriptions");

    // All API endpoints for applications
    // app.get("/api/applications/:id", async (req, res) => {
    //   const id = req.params.id;
    //   if (!ObjectId.isValid(id)) {
    //     return res.status(400).send({ error: "Invalid application ID format" });
    //   }
    //   const application = await applicationsCollection.findOne({ _id: new ObjectId(id) });
    //   if (!application) {
    //     return res.status(404).send({ error: "Application not found" });
    //   }
    //   res.send(application);
    // });

    app.get("/api/applications", async (req, res) => {
      const query = {};
      if (req.query.applicantId) {
        query.applicantId = req.query.applicantId;
      }
      if (req.query.jobId) {
        query.jobId = req.query.jobId;
      }
      const cursor = applicationsCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/api/applications", async (req, res) => {
      const application = req.body;
      const newApplication = {
        ...application,
        applicationDate: new Date(),
      };
      const result = await applicationsCollection.insertOne(newApplication);
      res.send(result);
    });

    // All API endpoints for users
    app.get("/api/users", async (req, res) => {
      const cursor = usersCollection.find({});
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid user ID format" });
      }
      const user = await usersCollection.findOne({ _id: new ObjectId(id) });
      if (!user) {
        return res.status(404).send({ error: "User not found" });
      }
      res.send(user);
    });

    // All API endpoints for companies
    app.get("/api/companies", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const statusFilter = req.query.status || "all";
        const query = {};
        if (statusFilter && statusFilter !== "all") {
          query.companyStatus = statusFilter;
        }

        // --- ADDED .sort({ _id: -1 }) TO ENFORCE LATEST FIRST ---
        const cursor = companiesCollection
          .find(query)
          .sort({ _id: -1 }) // Or use .sort({ createdAt: -1 }) if you track dates explicitly
          .skip(skip)
          .limit(limit);

        const companies = await cursor.toArray();
        const totalItems = await companiesCollection.countDocuments(query);

        const totalPending = await companiesCollection.countDocuments({
          companyStatus: "pending",
        });
        const totalApproved = await companiesCollection.countDocuments({
          companyStatus: "approved",
        });
        const totalRejected = await companiesCollection.countDocuments({
          companyStatus: "rejected",
        });

        res.send({
          companies,
          pagination: {
            totalItems,
            page,
            limit,
            totalPages: Math.ceil(totalItems / limit),
            currentStatus: statusFilter,
          },
          stats: {
            pending: totalPending,
            approved: totalApproved,
            rejected: totalRejected,
          },
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.get("/api/companies/:recruiterId", async (req, res) => {
      const recruiterId = req.params.recruiterId;
      const company = await companiesCollection.findOne({ recruiterId: recruiterId });
      const companyInfo = company || {};
      res.send(companyInfo);
    });

    app.post("/api/companies", async (req, res) => {
      const company = req.body;
      const result = await companiesCollection.insertOne(company);
      res.send(result);
    });

    app.patch("/api/companies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid company ID format" });
        }
        const updateData = req.body;
        const result = await companiesCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { upsert: true },
        );
        res.send(result);
      } catch (error) {
        console.error("Error updating company:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.delete("/api/companies/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid company ID format" });
        }
        const result = await companiesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Company not found" });
        }
        res.status(200).send(result);
      } catch (error) {
        console.error("Error deleting company:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // All API endpoints for jobs

    app.post("/api/jobs", async (req, res) => {
      const job = req.body;
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    });

    app.get("/api/jobs/:id", async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid job ID format" });
      }
      const job = await jobsCollection.findOne({ _id: new ObjectId(id) });
      if (!job) {
        return res.status(404).send({ error: "Job not found" });
      }
      res.send(job);
    });

    app.get("/api/jobs", async (req, res) => {
      try {
        const query = {};

        if (req.query.companyId && req.query.companyId !== "undefined") {
          query.companyId = req.query.companyId;
        }
        if (req.query.status) {
          query.jobStatus = req.query.status;
        }
        if (req.query.featured) {
          query.isFeatured = req.query.featured === "true";
        }

        // --- Search & Filter Parameters ---

        // Search by Job Title (Partial match, Case-insensitive)
        if (req.query.search) {
          query.jobTitle = { $regex: req.query.search, $options: "i" };
        }

        // Exact match for Category
        if (req.query.category && req.query.category !== "all") {
          query.jobCategory = req.query.category;
        }

        // Exact match for Job Type
        if (req.query.type && req.query.type !== "all") {
          query.jobType = req.query.type;
        }

        // Boolean check for Location (Remote vs Onsite)
        if (req.query.location && req.query.location !== "all") {
          query.isRemote = req.query.location === "remote";
        }

        const cursor = jobsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.delete("/api/jobs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ error: "Invalid job ID format" });
        }
        const result = await jobsCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).send({ error: "Job not found" });
        }

        res.status(200).send(result);
      } catch (error) {
        console.error("Error deleting job:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // All API endpoints for plans
    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.plan_id) {
        query.plan_id = req.query.plan_id;
      }
      const cursor = await plansCollection.findOne(query);
      res.send(cursor);
    });

    // All API endpoints for subscriptions
    app.post("/api/subscriptions", async (req, res) => {
      const data = req.body;
      const subscription = {
        ...data,
        createdAt: new Date(),
      };
      const result = await subscriptionsCollection.insertOne(subscription);

      // update the user form information
      const filter = { email: data.email };
      const updateDoc = {
        $set: {
          plan: data.planId,
        },
      };

      const updateResult = await usersCollection.updateOne(filter, updateDoc);
      res.send({ result, updateResult });
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
