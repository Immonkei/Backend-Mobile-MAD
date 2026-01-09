const express = require("express");
const router = express.Router();
const { admin, db } = require("../admin");

// Middleware to check admin role
const checkAdmin = async (req, res, next) => {
  try {
    const userId = req.user.uid;
    const userDoc = await db.collection("users").doc(userId).get();
    const userData = userDoc.data();

    if (userData.role !== "admin") {
      return res.status(403).json({
        success: false,
        error: "Admin access required",
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to verify admin role",
    });
  }
};

// Apply admin check to all routes
router.use(checkAdmin);

// Helper function to safely get documents with sorting
const getSortedDocuments = async (
  query,
  sortField = "timestamp",
  order = "desc"
) => {
  const snapshot = await query.get();
  const documents = [];
  snapshot.forEach((doc) => {
    documents.push({
      id: doc.id,
      ...doc.data(),
    });
  });

  // Sort in memory
  documents.sort((a, b) => {
    const valueA = a[sortField];
    const valueB = b[sortField];

    // Handle Firestore timestamps
    const timeA = valueA?.toDate ? valueA.toDate() : new Date(valueA);
    const timeB = valueB?.toDate ? valueB.toDate() : new Date(valueB);

    return order === "desc" ? timeB - timeA : timeA - timeB;
  });

  return documents;
};

// GET /api/admin/applications - Get all applications with filters
router.get("/", async (req, res) => {
  try {
    const {
      status,
      jobId,
      userId,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 50,
      sortBy = "appliedAt",
      order = "desc",
    } = req.query;

    let query = db.collection("applications");

    // Apply filters
    if (status) {
      query = query.where("status", "==", status);
    }

    if (jobId) {
      query = query.where("jobId", "==", jobId);
    }

    if (userId) {
      query = query.where("userId", "==", userId);
    }

    // Date range filter - create separate queries for date ranges
    let dateFilteredQuery = query;
    if (startDate) {
      const start = new Date(startDate);
      dateFilteredQuery = dateFilteredQuery.where("appliedAt", ">=", start);
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilteredQuery = dateFilteredQuery.where("appliedAt", "<=", end);
    }

    // Get all documents first, then sort and paginate in memory
    const snapshot = await dateFilteredQuery.get();
    let applications = [];

    snapshot.forEach((doc) => {
      applications.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort in memory
    applications.sort((a, b) => {
      let valueA, valueB;

      if (sortBy === "updatedAt") {
        valueA = a.updatedAt || a.appliedAt;
        valueB = b.updatedAt || b.appliedAt;
      } else if (sortBy === "status") {
        valueA = a.status || "";
        valueB = b.status || "";
        // For string sorting
        if (order === "asc") return valueA.localeCompare(valueB);
        return valueB.localeCompare(valueA);
      } else {
        valueA = a.appliedAt;
        valueB = b.appliedAt;
      }

      // Handle timestamps
      const timeA = valueA?.toDate ? valueA.toDate() : new Date(valueA);
      const timeB = valueB?.toDate ? valueB.toDate() : new Date(valueB);

      return order === "asc" ? timeA - timeB : timeB - timeA;
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      // We'll apply search after enrichment to include user/job details
    }

    // Pagination
    const total = applications.length;
    const startAt = (page - 1) * limit;
    const endAt = startAt + limit;
    const paginatedApplications = applications.slice(startAt, endAt);

    // Enrich applications with user and job details
    const enrichedApplications = await Promise.all(
      paginatedApplications.map(async (app) => {
        try {
          const [userDoc, jobDoc] = await Promise.all([
            db.collection("users").doc(app.userId).get(),
            db.collection("jobs").doc(app.jobId).get(),
          ]);

          if (userDoc.exists) {
            app.applicant = {
              id: userDoc.id,
              fullName: userDoc.data().fullName,
              email: userDoc.data().email,
              phone: userDoc.data().phone,
              location: userDoc.data().location,
              resumeUrl: userDoc.data().resumeUrl,
              profileComplete: userDoc.data().profileComplete || false,
            };
          }

          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            app.job = {
              id: jobDoc.id,
              title: jobData.title,
              company: jobData.company,
              location: jobData.location,
              status: jobData.status,
            };
          }

          return app;
        } catch (error) {
          console.error(`Error enriching application ${app.id}:`, error);
          return app;
        }
      })
    );

    // Apply search filter after enrichment
    let finalApplications = enrichedApplications;
    if (search) {
      const searchLower = search.toLowerCase();
      finalApplications = enrichedApplications.filter((app) => {
        const applicantName = app.applicant?.fullName?.toLowerCase() || "";
        const applicantEmail = app.applicant?.email?.toLowerCase() || "";
        const jobTitle = app.job?.title?.toLowerCase() || "";
        const companyName = app.job?.company?.toLowerCase() || "";

        return (
          applicantName.includes(searchLower) ||
          applicantEmail.includes(searchLower) ||
          jobTitle.includes(searchLower) ||
          companyName.includes(searchLower)
        );
      });
    }

    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      applications: finalApplications,
      pagination: {
        currentPage: Number(page),
        totalPages,
        totalItems: total,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: Number(limit),
      },
      filters: {
        status: status || "",
        jobId: jobId || "",
        userId: userId || "",
        startDate: startDate || "",
        endDate: endDate || "",
        search: search || "",
      },
    });
  } catch (error) {
    console.error("Get applications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch applications",
      message: error.message,
    });
  }
});

// GET /api/admin/applications/:id - Get single application details
router.get("/:id", async (req, res) => {
  try {
    const applicationId = req.params.id;

    const applicationDoc = await db
      .collection("applications")
      .doc(applicationId)
      .get();

    if (!applicationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    const application = {
      id: applicationDoc.id,
      ...applicationDoc.data(),
    };

    // Get user and job details
    const [userDoc, jobDoc] = await Promise.all([
      db.collection("users").doc(application.userId).get(),
      db.collection("jobs").doc(application.jobId).get(),
    ]);

    if (userDoc.exists) {
      const userData = userDoc.data();
      application.applicant = {
        id: userDoc.id,
        fullName: userData.fullName,
        email: userData.email,
        phone: userData.phone,
        location: userData.location,
        headline: userData.headline,
        skills: userData.skills || [],
        experience: userData.experience || [],
        education: userData.education || [],
        bio: userData.bio,
        resumeUrl: userData.resumeUrl,
        profileComplete: userData.profileComplete || false,
        createdAt: userData.createdAt,
      };
    }

    if (jobDoc.exists) {
      const jobData = jobDoc.data();
      application.job = {
        id: jobDoc.id,
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        type: jobData.type,
        category: jobData.category,
        remote: jobData.remote,
        status: jobData.status,
        postedBy: jobData.postedBy,
        postedByName: jobData.postedByName,
        createdAt: jobData.createdAt,
      };
    }

    // Get application history - using helper function for sorting
    const historySnap = await db
      .collection("applicationHistory")
      .where("applicationId", "==", applicationId)
      .get();

    application.history = [];
    historySnap.forEach((doc) => {
      application.history.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Sort history by timestamp descending
    application.history.sort((a, b) => {
      const timeA = a.timestamp?.toDate
        ? a.timestamp.toDate()
        : new Date(a.timestamp);
      const timeB = b.timestamp?.toDate
        ? b.timestamp.toDate()
        : new Date(b.timestamp);
      return timeB - timeA;
    });

    res.json({
      success: true,
      application,
    });
  } catch (error) {
    console.error("Get application details error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch application details",
      message: error.message,
    });
  }
});

// PATCH /api/admin/applications/:id/status - Update application status
router.patch("/:id/status", async (req, res) => {
  try {
    const applicationId = req.params.id;
    const { status, notes, nextStep, interviewDate, notifyUser = true } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const validStatuses = [
      "pending",
      "reviewed",
      "shortlisted",
      "interview",
      "accepted",
      "rejected",
      "withdrawn",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
      });
    }

    const applicationRef = db.collection("applications").doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    const currentData = applicationDoc.data();
    const previousStatus = currentData.status;

    const updateData = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: req.user.uid,
    };

    // Add interview date if provided and status is interview
    if (status === "interview" && interviewDate) {
      updateData.interviewDate = new Date(interviewDate);
      updateData.interviewScheduled = true;
    }

    // Add status change note that user can see
    if (notes && notifyUser !== false) {
      const statusNote = {
        content: `Status changed to ${status}: ${notes}`,
        addedBy: req.user.uid,
        addedByName: req.user.email,
        isInternal: false,
        notifyUser: true,
           timestamp: new Date(), 

        relatedStatus: status,
      };

      await applicationRef.update({
        "notes.adminNotes": admin.firestore.FieldValue.arrayUnion(statusNote),
      });
    }

    // Add next step if provided
    if (nextStep) {
      updateData.nextStep = nextStep;
    }

    await applicationRef.update(updateData);

    // Create history entry
    const historyData = {
      applicationId,
      previousStatus,
      newStatus: status,
      changedBy: req.user.uid,
      changedByName: req.user.email,
      notes: notes || "",
     timestamp: new Date(),

    };

    if (interviewDate && status === "interview") {
      historyData.interviewDate = new Date(interviewDate);
    }

    await db.collection("applicationHistory").add(historyData);

    // If application is accepted/rejected, update job applicant count
    if (status === "accepted" || status === "rejected") {
      const jobRef = db.collection("jobs").doc(currentData.jobId);
      const jobDoc = await jobRef.get();

      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        const updateJobData = {};

        if (status === "accepted") {
          updateJobData.acceptedApplicants =
            admin.firestore.FieldValue.increment(1);
        } else if (status === "rejected") {
          updateJobData.rejectedApplicants =
            admin.firestore.FieldValue.increment(1);
        }

        await jobRef.update(updateJobData);
      }
    }

    // Get updated application
    const updatedDoc = await applicationRef.get();
    const updatedApplication = {
      id: updatedDoc.id,
      ...updatedDoc.data(),
    };

    res.json({
      success: true,
      message: `Application status updated to ${status}`,
      application: updatedApplication,
      history: historyData,
    });
  } catch (error) {
    console.error("Update application status error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update application status",
      message: error.message,
    });
  }
});

// PATCH /api/admin/applications/:id/notes - Add notes to application
router.patch("/:id/notes", async (req, res) => {
  try {
    const applicationId = req.params.id;
    const { notes, isInternal = false, notifyUser = false } = req.body;

    if (!notes || notes.trim() === "") {
      return res.status(400).json({
        success: false,
        error: "Notes content is required",
      });
    }

    const applicationRef = db.collection("applications").doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    const appData = applicationDoc.data();
    const noteData = {
      content: notes.trim(),
      addedBy: req.user.uid,
      addedByName: req.user.email,
      isInternal: isInternal === true,
      notifyUser: notifyUser === true,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    };

    // Add to adminNotes array
    await applicationRef.update({
      "notes.adminNotes": admin.firestore.FieldValue.arrayUnion(noteData),
      "notes.lastUpdated": admin.firestore.FieldValue.serverTimestamp(),
      timestamp: new Date(),
      updatedBy: req.user.uid,
    });

    res.json({
      success: true,
      message: "Note added successfully",
      note: noteData,
      userNotified: notifyUser && !isInternal,
    });
  } catch (error) {
    console.error("Add note error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add note",
      message: error.message,
    });
  }
});

// GET /api/admin/applications/:id/notes - Get all notes (Admin view)
router.get("/:id/notes", async (req, res) => {
  try {
    const applicationId = req.params.id;

    const applicationDoc = await db
      .collection("applications")
      .doc(applicationId)
      .get();

    if (!applicationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    const appData = applicationDoc.data();

    // Return all notes (including internal ones)
    const allNotes = {
      userNotes: appData.notes?.userNotes || "",
      adminNotes: appData.notes?.adminNotes || [],
      lastUpdated: appData.notes?.lastUpdated,
      // Summary for admin
      summary: {
        totalAdminNotes: appData.notes?.adminNotes?.length || 0,
        internalNotes:
          appData.notes?.adminNotes?.filter((n) => n.isInternal)?.length || 0,
        userVisibleNotes:
          appData.notes?.adminNotes?.filter((n) => !n.isInternal)?.length || 0,
      },
    };

    res.json({
      success: true,
      notes: allNotes,
      applicationId,
    });
  } catch (error) {
    console.error("Get admin notes error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch notes",
      message: error.message,
    });
  }
});

// DELETE /api/admin/applications/:id - Delete application
router.delete("/:id", async (req, res) => {
  try {
    const applicationId = req.params.id;

    const applicationRef = db.collection("applications").doc(applicationId);
    const applicationDoc = await applicationRef.get();

    if (!applicationDoc.exists) {
      return res.status(404).json({
        success: false,
        error: "Application not found",
      });
    }

    const applicationData = applicationDoc.data();

    await applicationRef.delete();

    // Also delete associated history - no ordering needed for deletion
    const historySnap = await db
      .collection("applicationHistory")
      .where("applicationId", "==", applicationId)
      .get();

    const batch = db.batch();
    historySnap.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Log the deletion
    await db.collection("adminLogs").add({
      action: "delete_application",
      applicationId,
      jobId: applicationData.jobId,
      userId: applicationData.userId,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: "Application deleted successfully",
      applicationId,
    });
  } catch (error) {
    console.error("Delete application error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete application",
      message: error.message,
    });
  }
});

// POST /api/admin/applications/bulk-status - Bulk update application statuses
router.post("/bulk-status", async (req, res) => {
  try {
    const { applicationIds, status, notes } = req.body;

    if (
      !applicationIds ||
      !Array.isArray(applicationIds) ||
      applicationIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: "Application IDs array is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        error: "Status is required",
      });
    }

    const validStatuses = [
      "pending",
      "reviewed",
      "shortlisted",
      "interview",
      "accepted",
      "rejected",
      "withdrawn",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
      });
    }

    // Limit batch size
    const limitedIds = applicationIds.slice(0, 50);

    const results = {
      success: 0,
      failed: 0,
      details: [],
    };

    const batch = db.batch();

    // Process each application
    for (const applicationId of limitedIds) {
      try {
        const applicationRef = db.collection("applications").doc(applicationId);
        const applicationDoc = await applicationRef.get();

        if (!applicationDoc.exists) {
          results.failed++;
          results.details.push({
            applicationId,
            status: "failed",
            error: "Application not found",
          });
          continue;
        }

        const currentData = applicationDoc.data();

        // Update application
        batch.update(applicationRef, {
          status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: req.user.uid,
        });

        // Create history entry
        const historyRef = db.collection("applicationHistory").doc();
        const historyData = {
          applicationId,
          previousStatus: currentData.status,
          newStatus: status,
          changedBy: req.user.uid,
          changedByName: req.user.email,
          notes: notes || "",
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        };
        batch.set(historyRef, historyData);

        results.success++;
        results.details.push({
          applicationId,
          status: "success",
          previousStatus: currentData.status,
          newStatus: status,
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          applicationId,
          status: "failed",
          error: error.message,
        });
      }
    }

    // Commit batch
    await batch.commit();

    // Log bulk action
    await db.collection("adminLogs").add({
      action: "bulk_update_applications",
      status,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      count: limitedIds.length,
      successCount: results.success,
      failCount: results.failed,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      message: `Bulk status update completed: ${status}`,
      results,
      summary: {
        total: limitedIds.length,
        success: results.success,
        failed: results.failed,
      },
    });
  } catch (error) {
    console.error("Bulk status update error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update applications in bulk",
      message: error.message,
    });
  }
});

// GET /api/admin/applications/stats/overview - Get application statistics
router.get("/stats/overview", async (req, res) => {
  try {
    const { timeRange = "30d", jobId } = req.query;

    // Calculate time range
    const now = new Date();
    let startDate = new Date();

    switch (timeRange) {
      case "7d":
        startDate.setDate(now.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(now.getDate() - 30);
        break;
      case "90d":
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }

    let query = db.collection("applications");

    if (jobId) {
      query = query.where("jobId", "==", jobId);
    }

    // No ordering needed for stats - just filter by date
    const snapshot = await query.get();

    const allApplications = [];
    snapshot.forEach((doc) => {
      allApplications.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Filter by date in memory
    const applications = allApplications.filter((app) => {
      if (!app.appliedAt) return false;
      const appliedDate = app.appliedAt?.toDate
        ? app.appliedAt.toDate()
        : new Date(app.appliedAt);
      return appliedDate >= startDate;
    });

    // Calculate statistics
    const stats = {
      totalApplications: applications.length,
      applicationsByStatus: {
        pending: applications.filter((app) => app.status === "pending").length,
        reviewed: applications.filter((app) => app.status === "reviewed")
          .length,
        shortlisted: applications.filter((app) => app.status === "shortlisted")
          .length,
        interview: applications.filter((app) => app.status === "interview")
          .length,
        accepted: applications.filter((app) => app.status === "accepted")
          .length,
        rejected: applications.filter((app) => app.status === "rejected")
          .length,
        withdrawn: applications.filter((app) => app.status === "withdrawn")
          .length,
      },
      dailyApplications: [],
      applicationsBySource: {},
      topApplicants: [],
      conversionRate: 0,
    };

    // Calculate conversion rate (accepted / total)
    if (applications.length > 0) {
      stats.conversionRate = (
        (stats.applicationsByStatus.accepted / applications.length) *
        100
      ).toFixed(2);
    }

    // Daily applications for last 7 days
    const dailyData = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      dailyData[dateStr] = 0;
    }

    // Count daily applications
    applications.forEach((app) => {
      if (app.appliedAt) {
        const date = app.appliedAt.toDate
          ? app.appliedAt.toDate()
          : new Date(app.appliedAt);
        const dateStr = date.toISOString().split("T")[0];
        if (dailyData[dateStr] !== undefined) {
          dailyData[dateStr]++;
        }
      }
    });

    // Convert to array
    stats.dailyApplications = Object.entries(dailyData).map(
      ([date, count]) => ({
        date,
        count,
      })
    );

    // Get top 10 applicants by application count
    const applicantCount = {};
    applications.forEach((app) => {
      applicantCount[app.userId] = (applicantCount[app.userId] || 0) + 1;
    });

    const topApplicantIds = Object.entries(applicantCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    stats.topApplicants = await Promise.all(
      topApplicantIds.map(async ([userId, count]) => {
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data();
          return {
            userId,
            name: userData.fullName || "Unknown",
            email: userData.email,
            applicationCount: count,
            profileComplete: userData.profileComplete || false,
          };
        }
        return {
          userId,
          name: "Unknown User",
          applicationCount: count,
        };
      })
    );

    // If jobId is provided, get job details
    if (jobId) {
      const jobDoc = await db.collection("jobs").doc(jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        stats.job = {
          id: jobDoc.id,
          title: jobData.title,
          company: jobData.company,
          totalApplicants: applications.length,
        };
      }
    }

    res.json({
      success: true,
      stats,
      timeRange,
      jobId: jobId || null,
    });
  } catch (error) {
    console.error("Get application stats error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch application statistics",
      message: error.message,
    });
  }
});

// GET /api/admin/applications/export - Export applications
router.get("/export", async (req, res) => {
  try {
    const { format = "json", status, startDate, endDate, jobId } = req.query;

    let query = db.collection("applications");

    // Apply filters
    if (status) {
      query = query.where("status", "==", status);
    }

    if (jobId) {
      query = query.where("jobId", "==", jobId);
    }

    const snapshot = await query.get();

    const allApplications = [];
    snapshot.forEach((doc) => {
      allApplications.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Filter by date in memory
    let filteredApplications = allApplications;
    if (startDate || endDate) {
      filteredApplications = allApplications.filter((app) => {
        if (!app.appliedAt) return true;
        const appliedDate = app.appliedAt?.toDate
          ? app.appliedAt.toDate()
          : new Date(app.appliedAt);

        if (startDate) {
          const start = new Date(startDate);
          if (appliedDate < start) return false;
        }

        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (appliedDate > end) return false;
        }

        return true;
      });
    }

    // Sort by applied date descending
    filteredApplications.sort((a, b) => {
      const timeA = a.appliedAt?.toDate
        ? a.appliedAt.toDate()
        : new Date(a.appliedAt);
      const timeB = b.appliedAt?.toDate
        ? b.appliedAt.toDate()
        : new Date(b.appliedAt);
      return timeB - timeA;
    });

    // Get user and job details for export
    const enrichedApplications = await Promise.all(
      filteredApplications.map(async (app) => {
        try {
          const [userDoc, jobDoc] = await Promise.all([
            db.collection("users").doc(app.userId).get(),
            db.collection("jobs").doc(app.jobId).get(),
          ]);

          const exportData = {
            applicationId: app.id,
            appliedAt: app.appliedAt?.toDate
              ? app.appliedAt.toDate().toISOString()
              : app.appliedAt,
            status: app.status,
            coverLetter: app.coverLetter || "",
            resumeUrl: app.resumeUrl || "",
            additionalDocuments: app.additionalDocuments || [],
            notes: app.notes || [],
          };

          if (userDoc.exists) {
            const userData = userDoc.data();
            exportData.applicant = {
              id: userDoc.id,
              fullName: userData.fullName || "",
              email: userData.email || "",
              phone: userData.phone || "",
              location: userData.location || "",
              headline: userData.headline || "",
              skills: userData.skills || [],
            };
          }

          if (jobDoc.exists) {
            const jobData = jobDoc.data();
            exportData.job = {
              id: jobDoc.id,
              title: jobData.title || "",
              company: jobData.company || "",
              location: jobData.location || "",
              type: jobData.type || "",
            };
          }

          return exportData;
        } catch (error) {
          console.error(
            `Error enriching application ${app.id} for export:`,
            error
          );
          return {
            applicationId: app.id,
            error: "Failed to load details",
          };
        }
      })
    );

    // Export in requested format
    if (format === "csv") {
      // Convert to CSV
      const headers = [
        "Application ID",
        "Applied Date",
        "Status",
        "Applicant Name",
        "Applicant Email",
        "Applicant Phone",
        "Job Title",
        "Company",
        "Job Location",
        "Cover Letter Preview",
      ];

      const csvRows = enrichedApplications.map((app) => {
        const row = [
          app.applicationId,
          app.appliedAt,
          app.status,
          app.applicant?.fullName || "",
          app.applicant?.email || "",
          app.applicant?.phone || "",
          app.job?.title || "",
          app.job?.company || "",
          app.job?.location || "",
          app.coverLetter?.substring(0, 100) || "",
        ];
        return row
          .map((field) => `"${String(field).replace(/"/g, '""')}"`)
          .join(",");
      });

      const csvContent = [headers.join(","), ...csvRows].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="applications_export_${Date.now()}.csv"`
      );
      res.send(csvContent);
    } else if (format === "excel") {
      // For Excel, you would typically use a library like exceljs
      // For simplicity, we'll return JSON with instructions
      res.json({
        success: true,
        message:
          "Excel export requires additional setup. Use CSV or JSON format.",
        availableFormats: ["json", "csv"],
        data: enrichedApplications,
      });
    } else {
      // Default: JSON
      res.json({
        success: true,
        applications: enrichedApplications,
        exportInfo: {
          format: "json",
          count: enrichedApplications.length,
          timestamp: new Date().toISOString(),
          generatedBy: req.user.email,
        },
      });
    }

    // Log export action
    await db.collection("adminLogs").add({
      action: "export_applications",
      format,
      adminUserId: req.user.uid,
      adminUserEmail: req.user.email,
      count: enrichedApplications.length,
      filters: { status, jobId, startDate, endDate },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Export applications error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to export applications",
      message: error.message,
    });
  }
});

module.exports = router;
