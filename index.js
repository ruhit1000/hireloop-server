const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const port = 5000;
require("dotenv").config();

app.use(cors());
app.use(express.json());

const logger = (req, res, next) => {
  console.log("Verifying token...", req.params);
  next();
};

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
    const sessionCollection = db.collection("session");
    const savedJobsCollection = db.collection("saved_jobs");

    // verification middleware for protected routes
    const verifyToken = async (req, res, next) => {
      const authHeader = req?.headers?.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const query = { token: token };
      const session = await sessionCollection.findOne(query);
      if (!session) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const userId = session?.userId;
      const user = await usersCollection.findOne({ _id: userId });
      if (!user) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      req.user = user;
      next();
    };

    const verifySeeker = async (req, res, next) => {
      if (req.user?.role !== "seeker") {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    const verifyAdmin = async (req, res, next) => {
      if (req.user?.role !== "admin") {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    const verifyRecruiter = async (req, res, next) => {
      if (req.user?.role !== "recruiter") {
        return res.status(403).send({ message: "Forbidden Access" });
      }
      next();
    };

    // All Public API endpoints (no authentication required)
    // Jobs Related Endpoints
    app.get("/api/jobs", async (req, res) => {
      try {
        const query = {};

        if (req.query.companyId && req.query.companyId !== "undefined") {
          query.companyId = req.query.companyId;
        }
        if (req.query.status && req.query.status !== "all") {
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

        const pipeline = [
          { $match: query },
          {
            $lookup: {
              from: "companies",
              let: { jobCompanyId: "$companyId" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$_id", { $toObjectId: "$$jobCompanyId" }] },
                        { $eq: ["$companyStatus", "approved"] },
                      ],
                    },
                  },
                },
              ],
              as: "companyDetails",
            },
          },

          { $match: { companyDetails: { $not: { $size: 0 } } } },

          { $project: { companyDetails: 0 } },
        ];

        const result = await jobsCollection.aggregate(pipeline).toArray();
        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // Companies Related Endpoints
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

    // Plans Related Endpoints
    app.get("/api/plans", async (req, res) => {
      const query = {};
      if (req.query.plan_id) {
        query.plan_id = req.query.plan_id;
      }
      const cursor = await plansCollection.findOne(query);
      res.send(cursor);
    });

    // All API endpoints for logged in users (seekers, recruiters, admins)
    // Jobs Related Endpoints
    app.get("/api/jobs/:id", verifyToken, async (req, res) => {
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

    // Companies Related Endpoints
    app.patch("/api/companies/:id", verifyToken, async (req, res) => {
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

    // Subscriptions Related Endpoints
    app.post("/api/subscriptions", verifyToken, async (req, res) => {
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

    // All API endpoints for logged in seekers
    // Applications Related Endpoints
    app.get(
      "/api/my-applications",
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const query = {};
        if (req.query.applicantId) {
          query.applicantId = req.query.applicantId;
          if (query.applicantId !== req.user._id.toString()) {
            return res.status(403).send({ message: "Forbidden Access" });
          }
        }
        const cursor = applicationsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.post(
      "/api/applications",
      verifyToken,
      verifySeeker,
      async (req, res) => {
        const application = req.body;
        const newApplication = {
          ...application,
          applicationDate: new Date(),
        };
        const result = await applicationsCollection.insertOne(newApplication);
        res.send(result);
      },
    );

    // Saved Jobs Related Endpoints
    app.post("/api/saved-jobs/toggle", verifyToken, async (req, res) => {
      try {
        const { jobId } = req.body;

        const userId = req.user?.id || req.decoded?.id;

        if (!userId || !jobId) {
          return res
            .status(400)
            .send({ error: "Missing identity credentials or jobId." });
        }

        const query = { userId: userId, jobId: jobId };
        const existingSave = await savedJobsCollection.findOne(query);

        if (existingSave) {
          await savedJobsCollection.deleteOne(query);
          return res.send({
            saved: false,
            message: "Job removed from saved list.",
          });
        } else {
          await savedJobsCollection.insertOne({
            userId,
            jobId,
            savedAt: new Date(),
          });
          return res.send({
            saved: true,
            message: "Job saved successfully.",
          });
        }
      } catch (error) {
        console.error("Error toggling saved job:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    app.get("/api/saved-jobs/check/:jobId", verifyToken, async (req, res) => {
      try {
        const { jobId } = req.params;
        const userId = req.user?.id || req.decoded?.id;

        if (!userId || !jobId) {
          return res
            .status(400)
            .send({ error: "Missing identity credentials or jobId." });
        }

        const savedRecord = await savedJobsCollection.findOne({
          userId: userId,
          jobId: jobId,
        });
        res.send({ isSaved: !!savedRecord });
      } catch (error) {
        console.error("Error checking saved job:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // All API endpoints for logged in recruiters
    // Applications Related Endpoints
    app.get(
      "/api/applications",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        const query = {};
        if (req.query.jobId) {
          query.jobId = req.query.jobId;
        }
        if (req.query.recruiterId) {
          const company = await companiesCollection.findOne({
            recruiterId: req.query.recruiterId,
          });
          if (company) {
            query.companyId = company._id.toString();
          } else {
            return res
              .status(404)
              .send({ error: "Company not found for recruiter" });
          }
        }
        const cursor = applicationsCollection.find(query);
        const result = await cursor.toArray();
        res.send(result);
      },
    );

    app.patch(
      "/api/applications/:id",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .send({ error: "Invalid application ID format" });
        }
        const updateData = req.body;
        const result = await applicationsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
          { upsert: true },
        );
        res.send(result);
      },
    );

    // Companies Related Endpoints
    app.get(
      "/api/companies/:recruiterId",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        const recruiterId = req.params.recruiterId;
        const company = await companiesCollection.findOne({
          recruiterId: recruiterId,
        });
        const companyInfo = company || {};
        res.send(companyInfo);
      },
    );

    app.post(
      "/api/companies",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        const company = req.body;
        const result = await companiesCollection.insertOne(company);
        res.send(result);
      },
    );

    app.delete(
      "/api/companies/:id",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ error: "Invalid company ID format" });
          }

          // 1. Delete the company first
          const result = await companiesCollection.deleteOne({
            _id: new ObjectId(id),
          });

          // 2. If no company was deleted, stop here and return 404
          if (result.deletedCount === 0) {
            return res.status(404).send({ error: "Company not found" });
          }

          // 3. Only delete jobs if the company actually existed and was wiped out
          await jobsCollection.deleteMany({ companyId: id });

          res.status(200).send({
            success: true,
            message: "Company and associated jobs deleted.",
          });
        } catch (error) {
          console.error("Error deleting company:", error);
          res.status(500).send({ error: "Internal server error" });
        }
      },
    );

    // Stats Related Endpoints
    app.get(
      "/api/recruiter-stats",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        const { recruiterId } = req.query;
        if (!recruiterId) {
          return res
            .status(400)
            .send({ error: "Missing recruiterId parameter" });
        }
        const company = await companiesCollection.findOne({ recruiterId });
        if (!company) {
          return res
            .status(404)
            .send({ error: "Company not found for recruiter" });
        }
        const companyId = company._id.toString();

        const recentApplications = await applicationsCollection
          .find({ companyId })
          .sort({ applicationDate: -1 })
          .limit(5)
          .toArray();
        const totalJobs = await jobsCollection.countDocuments({ companyId });
        const totalApplications = await applicationsCollection.countDocuments({
          companyId,
        });
        const activeJobs = await jobsCollection.countDocuments({
          companyId,
          jobStatus: "active",
        });
        const closedJobs = await jobsCollection.countDocuments({
          companyId,
          jobStatus: "closed",
        });

        res.send({
          totalJobs,
          totalApplications,
          activeJobs,
          closedJobs,
          recentApplications,
        });
      },
    );

    // Jobs Related Endpoints
    app.post("/api/jobs", verifyToken, verifyRecruiter, async (req, res) => {
      const job = req.body;
      const result = await jobsCollection.insertOne(job);
      res.send(result);
    });

    app.delete(
      "/api/jobs/:id",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
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
      },
    );

    app.patch(
      "/api/jobs/:id",
      verifyToken,
      verifyRecruiter,
      async (req, res) => {
        try {
          const id = req.params.id;
          if (!ObjectId.isValid(id)) {
            return res.status(400).send({ error: "Invalid job ID format" });
          }
          const updateData = req.body;
          const result = await jobsCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData },
            { upsert: true },
          );
          res.send(result);
        } catch (error) {
          console.error("Error updating job:", error);
          res.status(500).send({ error: "Internal server error" });
        }
      },
    );

    // All API endpoints for logged in admins
    // Users Related Endpoints
    app.get("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
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
