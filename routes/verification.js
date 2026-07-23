const express = require("express");
const router = express.Router();

const verificationController = require("../controllers/verificationController");
const { isAuthenticated } = require("../middleware/authMiddleware");

router.get("/", isAuthenticated, verificationController.index);

router.post("/:id/confirm",
    isAuthenticated,
    verificationController.confirmIncident
);

router.post("/:id/dispute",
    isAuthenticated,
    verificationController.disputeIncident
);

module.exports = router;